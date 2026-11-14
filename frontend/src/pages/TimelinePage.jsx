import { useId } from "react";
import ActivityTimeline from "../components/ActivityTimeline.jsx";
import useRuns from "../hooks/useRuns.js";
import { formatTime, shortId } from "../utils.js";

export default function TimelinePage({ runId, onSelectRun }) {
  const { runs, error, loading } = useRuns();
  const selectId = useId();

  // Default to the most recent run when none is selected.
  const selected = runId || runs[0]?.id || null;

  return (
    <div className="page">
      <div className="page-head page-head-row">
        <div>
          <h2 className="page-title">Activity Timeline</h2>
          <p className="page-sub">Step-by-step events recorded for a single agent run.</p>
        </div>
        <div className="select-wrap">
          <label htmlFor={selectId} className="field-label">Run</label>
          <select
            id={selectId}
            className="select"
            value={selected || ""}
            disabled={loading || runs.length === 0}
            onChange={(e) => onSelectRun(e.target.value)}
          >
            {runs.length === 0 && <option value="">{loading ? "Loading…" : "No runs"}</option>}
            {selected && !runs.some((r) => r.id === selected) && (
              <option value={selected}>{shortId(selected)}</option>
            )}
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {shortId(run.id)} · {run.status} · {formatTime(run.started_at)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && !selected && (
        <div className="alert alert-error" role="alert">
          Could not load runs: {error.message}
        </div>
      )}

      <ActivityTimeline runId={selected} />
    </div>
  );
}
