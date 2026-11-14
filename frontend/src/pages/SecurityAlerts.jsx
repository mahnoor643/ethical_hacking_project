import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import { getAlerts } from "../services/api.js";
import { formatTime, shortId } from "../utils.js";

// Human-readable names for the categories written by worker/src/alerts.ts.
const CATEGORY_LABEL = {
  unauthorized_tool_selection: "Unauthorized tool selection",
  instruction_override_attempt: "Instruction override attempt",
  sensitive_data_request: "Sensitive data request",
  ai_tool_mismatch: "AI picked an irrelevant tool",
  ai_inference_failure: "AI inference failure",
  repeated_ai_failures: "Repeated AI failures",
  ai_quota_exhausted: "AI quota exhausted",
  general: "General"
};

const SEVERITY_CHIP = {
  high: "chip-danger",
  medium: "chip-warn",
  low: "chip-muted"
};

const FILTERS = [
  { id: "", label: "All" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" }
];

export default function SecurityAlerts({ onOpenTimeline }) {
  const [severity, setSeverity] = useState("");
  const [state, setState] = useState({
    loading: true,
    error: null,
    alerts: [],
    summary: { high: 0, medium: 0, low: 0 }
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getAlerts({ severity: severity || undefined });
      setState({
        loading: false,
        error: null,
        alerts: Array.isArray(data.alerts) ? data.alerts : [],
        summary: data.summary || { high: 0, medium: 0, low: 0 }
      });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error, alerts: [] }));
    }
  }, [severity]);

  useEffect(() => {
    load();
  }, [load]);

  const { loading, error, alerts, summary } = state;
  const total = (summary.high || 0) + (summary.medium || 0) + (summary.low || 0);

  const stats = [
    { label: "Total alerts", value: total, tone: "" },
    { label: "High", value: summary.high || 0, tone: "bad" },
    { label: "Medium", value: summary.medium || 0, tone: "warn" },
    { label: "Low", value: summary.low || 0, tone: "" }
  ];

  return (
    <div className="page">
      <div className="page-head page-head-row">
        <div>
          <h2 className="page-title">Security Alerts</h2>
          <p className="page-sub">
            Suspicious or abnormal agent behaviour recorded in D1. Plain unsupported tasks are
            rejected without raising an alert.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" /> : <Icon name="refresh" size={16} />} Refresh
        </button>
      </div>

      <div className="stat-grid stat-grid-4">
        {stats.map((s) => (
          <div key={s.label} className={`card stat tone-${s.tone}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{loading && !total ? "…" : error ? "—" : s.value}</div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Recent alerts</h2>
          <div className="filter-group" role="group" aria-label="Filter by severity">
            {FILTERS.map((f) => (
              <button
                key={f.id || "all"}
                type="button"
                className={`chip chip-button ${severity === f.id ? "is-selected" : ""}`}
                aria-pressed={severity === f.id}
                onClick={() => setSeverity(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={16} />
            <span>Could not load security alerts: {error.message}</span>
          </div>
        )}

        {!error && !loading && alerts.length === 0 && (
          <div className="empty-state">
            <Icon name="shield" size={28} />
            <h3 className="card-title">
              {severity ? `No ${severity}-severity alerts` : "No security alerts"}
            </h3>
            <p className="muted">
              Alerts appear here when a task tries to override the agent's instructions, asks
              for sensitive data, the AI selects a tool outside the allow-list, or Workers AI
              fails repeatedly.
            </p>
          </div>
        )}

        {alerts.length > 0 && (
          <ul className="alert-list">
            {alerts.map((a) => (
              <li key={a.id} className={`alert-item sev-${a.severity}`}>
                <div className="alert-item-top">
                  <span className={`chip chip-sm ${SEVERITY_CHIP[a.severity] || "chip-muted"}`}>
                    {a.severity}
                  </span>
                  <span className="alert-item-title">
                    {CATEGORY_LABEL[a.category] || a.category}
                  </span>
                  <time className="muted small nowrap">{formatTime(a.created_at)}</time>
                </div>
                <p className="alert-item-desc">{a.description}</p>
                <div className="alert-item-meta">
                  <span className="mono" title={a.run_id}>run {shortId(a.run_id)}</span>
                  {a.run_status && <span>· run {a.run_status}</span>}
                  {a.run_task && <span className="alert-item-task">· “{a.run_task}”</span>}
                  {onOpenTimeline && (
                    <button className="btn btn-link" onClick={() => onOpenTimeline(a.run_id)}>
                      Timeline <Icon name="arrow" size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
