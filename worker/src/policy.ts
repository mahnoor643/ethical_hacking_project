
// Server-side task policy.
//
// Rule: an allow-listed tool may only execute when it is both
// AUTHORIZED (on the allow-list) and RELEVANT (it actually fulfils
// the requested task). The AI model is never the only gate.
//
// This module is pure (no I/O) so it can be unit-tested directly.

export type ToolName = "calculateTotal" | "findHighestSale";

export const ALLOWED_TOOLS: readonly ToolName[] = [
  "calculateTotal",
  "findHighestSale"
];

export function isAllowedTool(value: unknown): value is ToolName {
  return (ALLOWED_TOOLS as readonly unknown[]).includes(value);
}

// Why a task was rejected.
//  - unsupported_operation: asks to change data or take an action
//    (delete, update, send email...). Not supported, not an attack.
//  - out_of_scope: not a sales-analysis request at all.
//  - no_applicable_tool: a sales question no approved tool answers
//    (e.g. "average sale"), or the AI picked a tool that doesn't fit.
//  - sensitive_data_request / prompt_injection: still just rejected,
//    but flagged so a reviewer can look at it.
export type RejectionCategory =
  | "unsupported_operation"
  | "out_of_scope"
  | "no_applicable_tool"
  | "sensitive_data_request"
  | "prompt_injection";

export interface Rejection {
  category: RejectionCategory;
  // Flagged rejections deserve human review. Plain unsupported
  // requests are NOT treated as security incidents.
  flagged: boolean;
  reason: string;
}

export const REJECTION_LABEL = "Rejected — Unsupported Task";

const FLAGGED: ReadonlySet<RejectionCategory> = new Set([
  "sensitive_data_request",
  "prompt_injection"
]);

function reject(category: RejectionCategory, reason: string): Rejection {
  return { category, flagged: FLAGGED.has(category), reason };
}

interface Rule {
  category: RejectionCategory;
  pattern: RegExp;
  reason: (match: string) => string;
}

// Checked in order; the first match wins. Flagged categories come
// first so "delete the passwords" is flagged, not merely unsupported.
const RULES: Rule[] = [
  {
    category: "prompt_injection",
    pattern:
      /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(instructions?|rules?|prompt|polic(y|ies))\b|\bsystem prompt\b|\bjailbreak\b|\bdeveloper mode\b|\byou are now\b/i,
    reason: () =>
      "The task tries to change the agent's instructions. Only sales analysis with approved tools is allowed."
  },
  {
    category: "sensitive_data_request",
    pattern:
      /\b(passwords?|passwd|passphrases?|credentials?|secrets?|api[ -]?keys?|access[ -]?tokens?|auth(entication)? tokens?|private[ -]?keys?|ssn|social security|credit[ -]?cards?|card numbers?|cvv)\b/i,
    reason: (m) =>
      `The task asks for sensitive data ("${m}"). The agent has no access to it and no tool provides it.`
  },
  {
    category: "unsupported_operation",
    pattern:
      /\b(delete|remove|drop|truncate|erase|wipe|purge|destroy|insert|update|modify|edit|alter|overwrite|rename|deactivate)\b/i,
    reason: (m) =>
      `"${m}" would change data. The agent is read-only: its tools only calculate total revenue and find the highest sale.`
  },
  {
    category: "unsupported_operation",
    pattern:
      /\b(send|e-?mail|emails|sms|upload|download|export|notify|share|transfer|refund|pay|purchase|sql|shell|command)\b/i,
    reason: (m) =>
      `"${m}" is an action the agent cannot perform. Its tools only calculate total revenue and find the highest sale.`
  }
];

const SALES_DOMAIN = /\b(sales?|revenue)\b/i;

// Phrases that show what each tool is for. A tool may only run when
// the task matches its intent, whatever the AI says.
const TOOL_INTENT: Record<ToolName, RegExp> = {
  calculateTotal:
    /\b(total|sum|overall|aggregate|combined|altogether|add up|how much revenue)\b/i,
  findHighestSale:
    /\b(highest|largest|biggest|top|max(imum)?|best|most expensive|greatest)\b/i
};

// Step 1, before the AI is called: reject tasks that are explicitly
// unsupported, destructive, sensitive, or outside sales analysis.
export function screenTask(task: string): Rejection | null {
  for (const rule of RULES) {
    const match = task.match(rule.pattern);
    if (match) return reject(rule.category, rule.reason(match[0]));
  }

  if (!SALES_DOMAIN.test(task)) {
    return reject(
      "out_of_scope",
      "The task is not a sales analysis request. Supported: total sales revenue, highest sale."
    );
  }

  return null;
}

// Tools whose intent matches the task text.
export function relevantTools(task: string): ToolName[] {
  return ALLOWED_TOOLS.filter((tool) => TOOL_INTENT[tool].test(task));
}

// Step 3, after the AI decides: the chosen tool must fit the task.
export function checkRelevance(task: string, tool: ToolName): Rejection | null {
  if (TOOL_INTENT[tool].test(task)) return null;

  return reject(
    "no_applicable_tool",
    `The AI selected ${tool}, but that tool does not fulfil this task. No tool was run.`
  );
}

export function noToolRejection(aiReason: string): Rejection {
  return reject(
    "no_applicable_tool",
    `No approved tool can fulfil this task. AI: ${aiReason}`
  );
}
