import Icon from "../components/Icon.jsx";
import { CHIP_FOR_TONE, toneOf } from "../components/ActivityTimeline.jsx";
import useRuns from "../hooks/useRuns.js";
import { formatTime, shortId } from "../utils.js";

export default function RunHistory({ onOpenTimeline }) {
  const { loading, error, runs, reload } = useRuns();

  return (
    <div className="page">
      <div className="page-head page-head-row">
        <div>
          <h2 className="page-title">Run History</h2>
          <p className="page-sub">The 50 most recent agent runs stored in D1.</p>
        </div>
        <button className="btn btn-ghost" onClick={reload} disabled={loading}>
          {loading ? <span className="spinner" /> : <Icon name="refresh" size={16} />} Refresh
        </button>
      </div>

      <section className="card">
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={16} />
            <span>Could not load runs: {error.message}</span>
          </div>
        )}
        {!error && !loading && runs.length === 0 && (
          <p className="muted">No runs recorded yet. Run the agent to create one.</p>
        )}
        {runs.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Task</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="mono" title={run.id}>{shortId(run.id)}</td>
                    <td className="task-cell">{run.task}</td>
                    <td>
                      <span className={`chip chip-sm ${CHIP_FOR_TONE[toneOf(run.status)]}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="nowrap muted">{formatTime(run.started_at)}</td>
                    <td>
                      <button className="btn btn-link" onClick={() => onOpenTimeline(run.id)}>
                        Timeline <Icon name="arrow" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
