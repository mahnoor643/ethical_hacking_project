import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { getRunLogs } from "../services/api.js";
import { formatTime, shortId } from "../utils.js";

const EVENT_META = {
  task_received: { label: "Task received", icon: "inbox" },
  policy_check: { label: "Policy check", icon: "shield" },
  decision: { label: "AI decision", icon: "brain" },
  relevance_check: { label: "Relevance check", icon: "shield" },
  tool_call: { label: "Tool execution", icon: "tool" },
  tool_result: { label: "Tool result", icon: "check" },
  final_response: { label: "Final response", icon: "flag" },
  task_rejected: { label: "Rejected — Unsupported Task", icon: "x" },
  ai_retry: { label: "AI timeout · retrying", icon: "refresh" },
  tool_blocked: { label: "Tool blocked (not allow-listed)", icon: "shield" },
  error: { label: "Error", icon: "alert" }
};

// Maps a DB status string to a visual tone.
// "rejected" is amber, not red: the system worked as intended.
export function toneOf(status) {
  if (status === "success" || status === "completed") return "ok";
  if (status === "failed" || status === "blocked") return "bad";
  if (status === "retrying" || status === "rejected") return "warn";
  return "pending";
}

export const CHIP_FOR_TONE = {
  ok: "chip-success",
  bad: "chip-danger",
  warn: "chip-warn",
  pending: "chip-muted"
};

export default function ActivityTimeline({ runId, refreshKey = 0, waiting = false }) {
  const [state, setState] = useState({ loading: false, error: null, run: null, logs: [] });

  const load = useCallback(async (signal) => {
    if (!runId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getRunLogs(runId, signal);
      if (signal?.aborted) return;
      setState({
        loading: false,
        error: null,
        run: data.run || null,
        logs: Array.isArray(data.logs) ? data.logs : []
      });
    } catch (error) {
      if (signal?.aborted) return;
      setState({ loading: false, error, run: null, logs: [] });
    }
  }, [runId]);

  // Don't fetch while a run is in progress; drop responses for a run
  // that is no longer selected.
  useEffect(() => {
    if (waiting) return;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey, waiting]);

  if (waiting) {
    return (
      <section className="card empty-state" aria-busy="true">
        <span className="spinner spinner-lg" aria-hidden="true" />
        <h2 className="card-title">Waiting for the run</h2>
        <p className="muted">Events will load from D1 when the agent finishes.</p>
      </section>
    );
  }

  if (!runId) {
    return (
      <section className="card empty-state">
        <Icon name="timeline" size={28} />
        <h2 className="card-title">No run selected</h2>
        <p className="muted">Run the agent or pick a run to see its recorded events.</p>
      </section>
    );
  }

  const { loading, error, run, logs } = state;

  return (
    <section className="card timeline-card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Activity timeline</h2>
          <p className="card-sub">
            Events recorded in D1 for run <span className="mono">{shortId(runId)}</span>
          </p>
        </div>
        <button className="icon-btn" onClick={() => load()} disabled={loading} aria-label="Reload timeline">
          {loading ? <span className="spinner" /> : <Icon name="refresh" />}
        </button>
      </div>

      {run && (
        <div className="run-summary">
          <span className={`chip ${CHIP_FOR_TONE[toneOf(run.status)]}`}>{run.status}</span>
          <span className="small">“{run.task}”</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="alert" size={16} />
          <span>Could not load activity logs: {error.message}</span>
        </div>
      )}

      {!error && !loading && logs.length === 0 && (
        <p className="muted">No events have been recorded for this run.</p>
      )}

      {logs.length > 0 && (
        <ol className="timeline">
          {logs.map((log) => {
            const meta = EVENT_META[log.event_type] || { label: log.event_type, icon: "flag" };
            const tone = log.event_type === "error" ? "bad" : toneOf(log.status);
            return (
              <li key={log.id} className={`timeline-item tone-${tone}`}>
                <span className="timeline-dot">
                  <Icon name={meta.icon} size={14} />
                </span>
                <div className="timeline-body">
                  <div className="timeline-top">
                    <span className="timeline-title">{meta.label}</span>
                    <span className={`chip chip-sm ${CHIP_FOR_TONE[tone]}`}>{log.status || "—"}</span>
                  </div>
                  {log.action && log.action !== meta.label && (
                    <div className="timeline-action mono break">{log.action}</div>
                  )}
                  {log.reason && <div className="timeline-reason">{log.reason}</div>}
                  <div className="timeline-meta">
                    <span className="mono">{log.event_type}</span>
                    <span aria-hidden="true">·</span>
                    <time>{formatTime(log.created_at)}</time>
                    <span aria-hidden="true">·</span>
                    <span className="mono" title={log.run_id}>run {shortId(log.run_id)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
