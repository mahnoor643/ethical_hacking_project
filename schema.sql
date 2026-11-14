-- Reference copy of the ORIGINAL schema (migration 0001).
--
-- The database is now managed with Wrangler migrations in ./migrations:
--   0001_initial_schema.sql              - these three tables
--   0002_security_alerts_and_rate_limits - alert category, indexes, rate_limits
--
-- Apply with:
--   npx wrangler d1 migrations apply agent-activity-db --local
--   npx wrangler d1 migrations apply agent-activity-db --remote

-- Stores every AI Agent execution
CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);

-- Stores decisions, tool calls, and results
CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    action TEXT,
    reason TEXT,
    status TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES agent_runs(id)
);

-- Stores security-related alerts
CREATE TABLE IF NOT EXISTS security_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES agent_runs(id)
);
