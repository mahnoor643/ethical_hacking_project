
import { createRun, logActivity } from "./logger";
import { calculateTotal, findHighestSale } from "./tools";

interface Env {
  DB: D1Database;
  AI: Ai;
}

type ToolName = "calculateTotal" | "findHighestSale";

interface AgentDecision {
  tool: ToolName;
  reason: string;
}

async function getAIDecision(
  ai: Ai,
  task: string
): Promise<AgentDecision> {

  const response = await ai.run(
    "@cf/meta/llama-3.1-8b-instruct",
    {
      messages: [
        {
          role: "system",
          content: `You are a sales analysis agent.

You have only two tools:
1. calculateTotal: calculates total sales revenue.
2. findHighestSale: identifies the highest sale.

Select exactly one tool based on the user's task.

Return ONLY a JSON object:
{"tool":"calculateTotal","reason":"Short explanation"}

The tool must be calculateTotal or findHighestSale.
The reason must be one short sentence.
Do not include markdown or additional text.`
        },
        {
          role: "user",
          content: task
        }
    ],
      max_tokens: 150
    }
  );

  const output = response.response;

  if (typeof output !== "string") {
    throw new Error("AI returned an invalid response");
  }

  // Extract JSON even if the model adds extra text.
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new Error("AI did not return JSON");
  }

  const decision: unknown = JSON.parse(
    output.slice(start, end + 1)
  );

  if (
    !decision ||
    typeof decision !== "object" ||
    !("tool" in decision) ||
    !("reason" in decision) ||
    !["calculateTotal", "findHighestSale"].includes(
      String(decision.tool)
    ) ||
    typeof decision.reason !== "string" ||
    !decision.reason.trim()
  ) {
    throw new Error("AI selected an invalid tool");
  }

  return {
    tool: decision.tool as ToolName,
    reason: decision.reason.slice(0, 300)
  };
}

export async function runAgent(
  env: Env,
  task: string
) {
  const runId = crypto.randomUUID();

  await createRun(env.DB, runId, task);

  try {
    // Step 1: Ask AI to select a tool.
    const decision = await getAIDecision(
      env.AI,
      task
    );

    // Step 2: Log the AI decision.
    await logActivity(
      env.DB,
      runId,
      "decision",
      `Selected ${decision.tool}`,
      decision.reason,
      "success"
    );

    // Step 3: Log the tool call.
    await logActivity(
      env.DB,
      runId,
      "tool_call",
      decision.tool,
      "Calling an approved tool",
      "running"
    );

    // Step 4: Execute the approved tool.
    const result =
      decision.tool === "calculateTotal"
        ? calculateTotal()
        : findHighestSale();

    // Step 5: Log the tool result.
    await logActivity(
      env.DB,
      runId,
      "tool_result",
      JSON.stringify(result),
      "Approved tool executed successfully",
      "success"
    );

    // Step 6: Log the final output.
    await logActivity(
      env.DB,
      runId,
      "final_response",
      JSON.stringify(result),
      "Agent task completed",
      "success"
    );

    // Step 7: Update the run status.
    await env.DB.prepare(
      `UPDATE agent_runs
       SET status = ?,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind("completed", runId)
      .run();

    return {
      runId,
      status: "completed",
      selectedTool: decision.tool,
      reason: decision.reason,
      result
    };

  } catch (error) {
    console.error("Agent error:", error);

    await env.DB.prepare(
      `UPDATE agent_runs
       SET status = ?,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind("failed", runId)
      .run();

    await logActivity(
      env.DB,
      runId,
      "error",
      "Agent execution failed",
      "AI decision or tool execution failed",
      "failed"
    );

    throw error;
  }
}
