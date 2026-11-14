
import {
  REPEATED_FAILURE_THRESHOLD,
  REPEATED_WINDOW_MINUTES,
  alertForRejection,
  countRecentAIFailures,
  recordAlert,
  sanitizeLabel,
  type AlertCategory,
  type AlertSeverity
} from "./alerts.ts";
import { createRun, logActivity, setRunStatus, updateActivityStatus } from "./logger.ts";
import {
  REJECTION_LABEL,
  checkRelevance,
  isAllowedTool,
  noToolRejection,
  screenTask,
  type Rejection,
  type ToolName
} from "./policy.ts";
import { TOOLS, type ToolRegistry } from "./tools.ts";

interface Env {
  DB: D1Database;
  AI: Ai;
}

// Workers AI model used for tool selection.
// History: "@cf/meta/llama-3.1-8b-instruct" was deprecated on 2026-05-30 and
// "@cf/meta/llama-3.1-8b-instruct-fp8" is scheduled for deprecation on
// 2026-11-20. llama-4-scout has no deprecation date, returns the same
// { response: string } shape and costs ~13 neurons per call here.
// Check the catalog with `npx wrangler ai models list` before changing it.
export const AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

// Fail the run instead of hanging if Workers AI never answers.
// Normal responses take 1-3 s; occasional calls never return.
const AI_TIMEOUT_MS = 15_000;
// One retry at most, and only after a timeout.
const AI_MAX_ATTEMPTS = 2;
// Small reply: one JSON object.
const AI_MAX_TOKENS = 150;
// The agent may execute at most this many tools per task.
export const MAX_TOOL_CALLS_PER_RUN = 1;

class AITimeoutError extends Error {}

// The AI named a tool that is not on the allow-list.
export class UnapprovedToolError extends Error {
  readonly tool: string;
  constructor(tool: unknown) {
    super("AI selected an invalid tool");
    this.tool = sanitizeLabel(tool);
  }
}

// The daily AI budget is used up (ours, or the Workers AI free allocation).
export class AIQuotaError extends Error {}

// Workers AI reports an exhausted free allocation with error 4006
// ("you have used up your daily free allocation of 10,000 neurons").
function isWorkersAIQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b4006\b|daily free allocation|neurons|quota/i.test(message);
}

// Thrown by runAgent so the API can return the run ID of a failed run.
export class AgentRunError extends Error {
  readonly runId: string;
  readonly httpStatus: number;
  readonly publicMessage: string;

  constructor(runId: string, cause: unknown) {
    super("Agent execution failed", { cause });
    this.runId = runId;
    if (cause instanceof AIQuotaError) {
      this.httpStatus = 503;
      this.publicMessage =
        "The daily AI usage limit has been reached. No tool was executed. Please try again after 00:00 UTC.";
    } else if (cause instanceof UnapprovedToolError) {
      this.httpStatus = 500;
      this.publicMessage =
        "Blocked: the AI selected a tool that is not on the allow-list. No tool was executed.";
    } else if (cause instanceof AITimeoutError) {
      this.httpStatus = 504;
      this.publicMessage = "Workers AI did not respond in time. No tool was executed. Please retry.";
    } else {
      this.httpStatus = 500;
      this.publicMessage = "Agent execution failed";
    }
  }
}

export interface AgentOptions {
  aiTimeoutMs?: number;
  aiMaxAttempts?: number;
  // Called before every AI request (including retries). Throw
  // AIQuotaError to stop the run when the daily budget is used up.
  beforeAICall?: () => Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AITimeoutError(`AI request timed out after ${ms} ms`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

// The model may pick a tool OR decline. It is never forced to pick one.
export type AgentDecision =
  | { action: "use_tool"; tool: ToolName; reason: string }
  | { action: "reject"; reason: string };

const SYSTEM_PROMPT = `You are a read-only sales analysis agent.

You have only two tools:
1. calculateTotal: calculates the total sales revenue across all records.
2. findHighestSale: finds the single highest sale (product and amount).

Use a tool ONLY if it directly answers the user's task.
If neither tool answers the task (for example: deleting or changing data,
sending messages, averages, counts per product, anything not listed), reject it.
Never pick a tool just because you must pick something.

Return ONLY one JSON object, in one of these two forms:
{"action":"use_tool","tool":"calculateTotal","reason":"Short explanation"}
{"action":"reject","reason":"Short explanation"}

"tool" must be calculateTotal or findHighestSale.
The reason must be one short sentence.
Do not include markdown or additional text.`;

// Pulls the model text out of the Workers AI response. Handles the
// classic { response: "..." } shape, an already-parsed object, and the
// OpenAI-style { choices: [{ message: { content } }] } shape.
export function extractModelOutput(response: unknown): unknown {
  if (!response || typeof response !== "object") return response;
  const r = response as Record<string, unknown>;
  if (r.response !== undefined) {
    return r.response !== null && typeof r.response === "object"
      ? JSON.stringify(r.response)
      : r.response;
  }
  const choices = r.choices as Array<{ message?: { content?: unknown } }> | undefined;
  return choices?.[0]?.message?.content;
}

// Validates the model's JSON. Exported for tests.
export function parseDecision(output: unknown): AgentDecision {
  if (typeof output !== "string") {
    throw new Error("AI returned an invalid response");
  }

  // Extract JSON even if the model adds extra text.
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new Error("AI did not return JSON");
  }

  const decision: unknown = JSON.parse(output.slice(start, end + 1));

  if (!decision || typeof decision !== "object") {
    throw new Error("AI returned an invalid decision");
  }

  const d = decision as Record<string, unknown>;
  const reason =
    typeof d.reason === "string" && d.reason.trim()
      ? d.reason.trim().slice(0, 300)
      : null;

  if (!reason) {
    throw new Error("AI decision has no reason");
  }

  // Accept an explicit reject, and tolerate {"tool":"none"/null}.
  if (
    d.action === "reject" ||
    d.tool === null ||
    d.tool === "none" ||
    d.tool === "no_applicable_tool"
  ) {
    return { action: "reject", reason };
  }

  // Unknown tool names are blocked and raise a security alert.
  if (!isAllowedTool(d.tool)) {
    throw new UnapprovedToolError(d.tool);
  }

  return { action: "use_tool", tool: d.tool, reason };
}

// Calls Workers AI, retrying only when a request times out.
async function getAIDecision(
  ai: Ai,
  task: string,
  opts: Required<Pick<AgentOptions, "aiTimeoutMs" | "aiMaxAttempts">> & AgentOptions,
  onRetry: (attempt: number) => Promise<void>
): Promise<AgentDecision> {
  for (let attempt = 1; ; attempt++) {
    await opts.beforeAICall?.();
    try {
      return await requestAIDecision(ai, task, opts.aiTimeoutMs);
    } catch (error) {
      if (isWorkersAIQuotaError(error) && !(error instanceof UnapprovedToolError)) {
        throw new AIQuotaError("Workers AI daily allocation exhausted", { cause: error });
      }
      if (!(error instanceof AITimeoutError) || attempt >= opts.aiMaxAttempts) {
        throw error;
      }
      await onRetry(attempt + 1);
    }
  }
}

async function requestAIDecision(
  ai: Ai,
  task: string,
  timeoutMs: number
): Promise<AgentDecision> {
  const response = await withTimeout(
    ai.run(AI_MODEL as Parameters<Ai["run"]>[0], {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: task }
      ],
      max_tokens: AI_MAX_TOKENS
    } as never),
    timeoutMs
  );

  return parseDecision(extractModelOutput(response));
}

export interface RejectedRun {
  runId: string;
  status: "rejected";
  label: typeof REJECTION_LABEL;
  stage: "policy_check" | "decision" | "relevance_check";
  selectedTool: null;
  result: null;
  rejection: Rejection;
  alertRaised: boolean;
}

export interface CompletedRun {
  runId: string;
  status: "completed";
  selectedTool: ToolName;
  reason: string;
  result: unknown;
}

export async function runAgent(
  env: Env,
  task: string,
  // Injectable so tests can prove which tools ran.
  tools: ToolRegistry = TOOLS,
  options: AgentOptions = {}
): Promise<CompletedRun | RejectedRun> {
  const opts = {
    aiTimeoutMs: AI_TIMEOUT_MS,
    aiMaxAttempts: AI_MAX_ATTEMPTS,
    ...options
  };
  const runId = crypto.randomUUID();

  await createRun(env.DB, runId, task);

  // An alert must never break the run it describes.
  async function alert(severity: AlertSeverity, category: AlertCategory, description: string) {
    try {
      await recordAlert(env.DB, runId, severity, category, description);
    } catch (error) {
      console.error("Could not record security alert:", error);
    }
  }

  // Tracks which step failed so the error log is useful
  // without storing internal error details.
  let stage = "Policy check";

  // Records a rejection: the stage event, a final event, and the
  // run status. No tool is ever called on this path.
  async function rejectRun(
    rejectStage: RejectedRun["stage"],
    action: string,
    rejection: Rejection
  ): Promise<RejectedRun> {
    stage = "Rejection logging";

    await logActivity(env.DB, runId, rejectStage, action, rejection.reason, "rejected");

    await logActivity(
      env.DB,
      runId,
      "task_rejected",
      REJECTION_LABEL,
      `${rejection.category}${rejection.flagged ? " (flagged for review)" : ""}: ` +
        `${rejection.reason} No tool was executed.`,
      "rejected"
    );

    await setRunStatus(env.DB, runId, "rejected");

    // Only suspicious rejections raise an alert (see alerts.ts).
    const flagged = alertForRejection(rejection);
    if (flagged) {
      await alert(flagged.severity, flagged.category, rejection.reason);
    } else if (rejectStage === "relevance_check") {
      await alert("low", "ai_tool_mismatch", rejection.reason);
    }

    return {
      runId,
      status: "rejected",
      label: REJECTION_LABEL,
      stage: rejectStage,
      selectedTool: null,
      result: null,
      rejection,
      alertRaised: Boolean(flagged) || rejectStage === "relevance_check"
    };
  }

  let toolCalls = 0;

  try {
    // Step 0: Record that the task was received.
    await logActivity(env.DB, runId, "task_received", "Task received", task, "success");

    // Step 1: Server-side policy screen, before the AI is involved.
    const screened = screenTask(task);
    if (screened) {
      return await rejectRun("policy_check", `Blocked: ${screened.category}`, screened);
    }

    await logActivity(
      env.DB,
      runId,
      "policy_check",
      "Policy check passed",
      "Read-only sales analysis request",
      "success"
    );

    // Step 2: Ask the AI to select a tool, or decline.
    stage = "AI decision";
    const decision = await getAIDecision(env.AI, task, opts, (attempt) =>
      logActivity(
        env.DB,
        runId,
        "ai_retry",
        "AI request timed out",
        `Retrying AI decision (attempt ${attempt} of ${opts.aiMaxAttempts})`,
        "retrying"
      ).then(() => undefined)
    );

    if (decision.action === "reject") {
      return await rejectRun("decision", "No applicable tool", noToolRejection(decision.reason));
    }

    await logActivity(
      env.DB,
      runId,
      "decision",
      `Selected ${decision.tool}`,
      decision.reason,
      "success"
    );

    // Step 3: Relevance gate. Authorized is not enough: the tool
    // must also fulfil the task, whatever the AI claims.
    stage = "Relevance check";
    const irrelevant = checkRelevance(task, decision.tool);
    if (irrelevant) {
      return await rejectRun("relevance_check", `${decision.tool} not relevant`, irrelevant);
    }

    await logActivity(
      env.DB,
      runId,
      "relevance_check",
      `${decision.tool} matches the task`,
      "Tool is allow-listed and relevant to the request",
      "success"
    );

    // Step 4: Log the tool call (closed below once it finishes).
    if (++toolCalls > MAX_TOOL_CALLS_PER_RUN) {
      throw new Error("Tool execution limit exceeded");
    }
    const toolLogId = await logActivity(
      env.DB,
      runId,
      "tool_call",
      decision.tool,
      "Calling an approved tool",
      "running"
    );

    // Step 5: Execute the approved, relevant tool.
    stage = "Tool execution";
    let result: unknown;
    try {
      result = tools[decision.tool]();
    } catch (error) {
      await updateActivityStatus(env.DB, toolLogId, "failed");
      throw error;
    }
    await updateActivityStatus(env.DB, toolLogId, "success");

    stage = "Result logging";

    // Step 6: Log the tool result.
    await logActivity(
      env.DB,
      runId,
      "tool_result",
      JSON.stringify(result),
      "Approved tool executed successfully",
      "success"
    );

    // Step 7: Log the final output.
    await logActivity(
      env.DB,
      runId,
      "final_response",
      JSON.stringify(result),
      "Agent task completed",
      "success"
    );

    // Step 8: Update the run status.
    await setRunStatus(env.DB, runId, "completed");

    return {
      runId,
      status: "completed",
      selectedTool: decision.tool,
      reason: decision.reason,
      result
    };
  } catch (error) {
    console.error("Agent error:", error);

    await setRunStatus(env.DB, runId, "failed");

    if (error instanceof UnapprovedToolError) {
      // The blocked tool is recorded, never executed.
      await logActivity(
        env.DB,
        runId,
        "tool_blocked",
        `Blocked tool: ${error.tool}`,
        "The AI selected a tool that is not on the server allow-list. It was not executed.",
        "blocked"
      );
      await alert(
        "high",
        "unauthorized_tool_selection",
        `The AI attempted to select "${error.tool}", which is not on the allow-list. The tool was blocked and not executed.`
      );
    } else if (error instanceof AIQuotaError) {
      await alert(
        "medium",
        "ai_quota_exhausted",
        "The daily AI usage budget is exhausted. The request was stopped before inference; no tool was executed."
      );
    } else if (stage === "AI decision") {
      const timedOut = error instanceof AITimeoutError;
      const description = timedOut
        ? `Workers AI timed out on all ${opts.aiMaxAttempts} attempts.`
        : "Workers AI returned an error or an invalid decision.";
      let recent = 0;
      try {
        recent = await countRecentAIFailures(env.DB);
      } catch {
        // Counting is best-effort.
      }
      if (recent + 1 >= REPEATED_FAILURE_THRESHOLD) {
        await alert(
          "high",
          "repeated_ai_failures",
          `${description} This is AI failure #${recent + 1} in the last ${REPEATED_WINDOW_MINUTES} minutes.`
        );
      } else {
        await alert(timedOut ? "medium" : "low", "ai_inference_failure", description);
      }
    }

    await logActivity(
      env.DB,
      runId,
      "error",
      "Agent execution failed",
      error instanceof AIQuotaError ? "Daily AI usage limit reached" : `${stage} failed`,
      "failed"
    );

    throw new AgentRunError(runId, error);
  }
}
