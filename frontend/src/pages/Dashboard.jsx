import Icon from "../components/Icon.jsx";
import { CHIP_FOR_TONE, toneOf } from "../components/ActivityTimeline.jsx";
import useRuns from "../hooks/useRuns.js";
import { formatTime, shortId } from "../utils.js";

export default function Dashboard({ onNavigate, onOpenTimeline }) {
  const { loading, error, runs } = useRuns();

  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const rejected = runs.filter((r) => r.status === "rejected").length;
  const running = runs.length - completed - failed - rejected;

  const stats = [
    { label: "Recent runs", value: runs.length, tone: "" },
    { label: "Completed", value: completed, tone: "ok" },
    { label: "Rejected", value: rejected, tone: "warn" },
    { label: "Failed", value: failed, tone: "bad" },
    { label: "In progress", value: running, tone: "" }
  ];

  return (
    <div className="page">
      <div className="page-head page-head-row">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-sub">Overview of the latest 50 agent runs recorded in D1.</p>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate("execution")}>
          <Icon name="play" size={16} /> New agent run
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="alert" size={16} />
          <span>Could not load runs: {error.message}</span>
        </div>
      )}

      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.label} className={`card stat tone-${s.tone}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{loading ? "…" : error ? "—" : s.value}</div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Latest runs</h2>
          <button className="btn btn-link" onClick={() => onNavigate("history")}>
            View all <Icon name="arrow" size={14} />
          </button>
        </div>
        {!loading && !error && runs.length === 0 && (
          <p className="muted">No runs yet. Start one from Agent Execution.</p>
        )}
        <ul className="run-list">
          {runs.slice(0, 5).map((run) => (
            <li key={run.id}>
              <button className="run-row" onClick={() => onOpenTimeline(run.id)}>
                <span className={`chip chip-sm ${CHIP_FOR_TONE[toneOf(run.status)]}`}>{run.status}</span>
                <span className="run-row-task">{run.task}</span>
                <span className="mono muted small">{shortId(run.id)}</span>
                <span className="muted small nowrap">{formatTime(run.started_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
