
// Security Alerts module.
//
// Alerts are written to the security_alerts table and are always tied to
// the agent run (run_id) that caused them. Only genuinely suspicious or
// operationally important events raise an alert. A plain unsupported or
// out-of-scope task is NOT an alert: it is rejected and logged, nothing more.

import type { Rejection } from "./policy.ts";

export type AlertSeverity = "low" | "medium" | "high";

export type AlertCategory =
  // The AI tried to call a tool that is not on the server allow-list.
  | "unauthorized_tool_selection"
  // The task tried to override the agent's instructions (prompt injection).
  | "instruction_override_attempt"
  // The task asked for credentials / secrets / personal data.
  | "sensitive_data_request"
  // The AI picked an allow-listed tool that does not fit the task.
  | "ai_tool_mismatch"
  // Workers AI failed (timeout after retries, invalid output, error).
  | "ai_inference_failure"
  // Several AI failures within a short period.
  | "repeated_ai_failures"
  // The daily AI budget (ours or Workers AI's free allocation) is used up.
  | "ai_quota_exhausted";

export const ALERT_SEVERITIES: readonly AlertSeverity[] = ["low", "medium", "high"];

// How many AI failures within REPEATED_WINDOW_MINUTES count as "repeated".
export const REPEATED_FAILURE_THRESHOLD = 3;
export const REPEATED_WINDOW_MINUTES = 60;

const MAX_DESCRIPTION = 500;

export async function recordAlert(
  db: D1Database,
  runId: string,
  severity: AlertSeverity,
  category: AlertCategory,
  description: string
) {
  await db.prepare(
    `INSERT INTO security_alerts (run_id, severity, category, description)
     VALUES (?, ?, ?, ?)`
  )
  .bind(runId, severity, category, description.slice(0, MAX_DESCRIPTION))
  .run();
}

// Which policy rejections deserve an alert. Unsupported / out-of-scope /
// no-applicable-tool rejections return null: they are not attacks.
export function alertForRejection(
  rejection: Rejection
): { severity: AlertSeverity; category: AlertCategory } | null {
  switch (rejection.category) {
    case "prompt_injection":
      return { severity: "high", category: "instruction_override_attempt" };
    case "sensitive_data_request":
      return { severity: "medium", category: "sensitive_data_request" };
    default:
      return null;
  }
}

// Counts AI failure alerts (both categories) in the recent window.
export async function countRecentAIFailures(db: D1Database): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM security_alerts
     WHERE category IN ('ai_inference_failure', 'repeated_ai_failures')
       AND created_at >= datetime('now', ?)`
  )
  .bind(`-${REPEATED_WINDOW_MINUTES} minutes`)
  .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

// Makes model-supplied text safe to store and display as a short label.
export function sanitizeLabel(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return text.replace(/[^\w.\-]/g, "").slice(0, 64) || "(unnamed)";
}
