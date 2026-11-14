-- Migration 0002: Security Alerts module + server-side rate limiting.
--
-- NON-DESTRUCTIVE: adds one column (with a default), indexes and one new
-- table. No existing row is modified or deleted, no table is dropped.

-- Alerts get a category (e.g. instruction_override_attempt).
-- Existing rows (if any) receive 'general'.
ALTER TABLE security_alerts ADD COLUMN category TEXT NOT NULL DEFAULT 'general';

-- Read-path indexes (dashboard, timeline, alerts page).
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_security_alerts_run_id ON security_alerts(run_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_run_id ON activity_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs(started_at);

-- Fixed-window counters for rate limits and the daily AI-call budget.
-- bucket = "<limit name>:<hashed client id or 'global'>".
CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, window_start)
);
