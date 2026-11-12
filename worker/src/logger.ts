
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

export async function logActivity(
  db: D1Database,
  runId: string,
  eventType: string,
  action: string,
  reason: string,
  status: string
) {
  await db.prepare(
    `INSERT INTO activity_logs
     (run_id, event_type, action, reason, status)
     VALUES (?, ?, ?, ?, ?)`
  )
  .bind(runId, eventType, action, reason, status)
  .run();
}
