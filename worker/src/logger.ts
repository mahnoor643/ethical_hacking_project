
export interface Env {
  DB: D1Database;
}

export async function createRun(
  db: D1Database,
  runId: string,
  task: string
) {
  await db.prepare(
    `INSERT INTO agent_runs (id, task, status)
     VALUES (?, ?, ?)`
  )
  .bind(runId, task, "running")
  .run();
}

// Returns the new activity_logs row ID so a step logged as "running"
// can be closed later with updateActivityStatus().
export async function logActivity(
  db: D1Database,
  runId: string,
  eventType: string,
  action: string,
  reason: string,
  status: string
): Promise<number | null> {
  const result = await db.prepare(
    `INSERT INTO activity_logs
     (run_id, event_type, action, reason, status)
     VALUES (?, ?, ?, ?, ?)`
  )
  .bind(runId, eventType, action, reason, status)
  .run();

  const id = result?.meta?.last_row_id;
  return typeof id === "number" ? id : null;
}

// Closes a step that was logged before it finished (e.g. tool_call),
// so the timeline never shows a completed step as "running".
export async function updateActivityStatus(
  db: D1Database,
  logId: number | null,
  status: string
) {
  if (logId === null) return;
  await db.prepare(
    `UPDATE activity_logs SET status = ? WHERE id = ?`
  )
  .bind(status, logId)
  .run();
}

export type RunStatus = "completed" | "rejected" | "failed";

export async function setRunStatus(
  db: D1Database,
  runId: string,
  status: RunStatus
) {
  await db.prepare(
    `UPDATE agent_runs
     SET status = ?,
         completed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
  .bind(status, runId)
  .run();
}
