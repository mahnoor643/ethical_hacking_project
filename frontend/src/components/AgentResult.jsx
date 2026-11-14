import Icon from "./Icon.jsx";
import { formatCurrency } from "../utils.js";

function isHighestSale(result) {
  return (
    result &&
    typeof result === "object" &&
    typeof result.product === "string" &&
    typeof result.amount === "number"
  );
}

function isTotal(result) {
  return (
    result &&
    typeof result === "object" &&
    typeof result.total === "number" &&
    typeof result.records === "number"
  );
}

function ResultBody({ result }) {
  if (isHighestSale(result)) {
    return (
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Product</div>
          <div className="metric-value">{result.product}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Sale amount</div>
          <div className="metric-value accent">{formatCurrency(result.amount)}</div>
        </div>
      </div>
    );
  }

  if (isTotal(result)) {
    return (
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Total revenue</div>
          <div className="metric-value accent">{formatCurrency(result.total)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Records</div>
          <div className="metric-value">{result.records}</div>
        </div>
      </div>
    );
  }

  // Unknown shape: show it as text (React escapes it; no HTML injection).
  return <pre className="code-block">{JSON.stringify(result, null, 2)}</pre>;
}

const CATEGORY_LABEL = {
  unsupported_operation: "Unsupported operation",
  out_of_scope: "Outside sales analysis",
  no_applicable_tool: "No applicable tool",
  sensitive_data_request: "Sensitive data request",
  prompt_injection: "Instruction override attempt"
};

const STAGE_LABEL = {
  policy_check: "Server policy check (before AI)",
  decision: "AI decision",
  relevance_check: "Server relevance check (after AI)"
};

// The server refused the task. No tool ran, so there is no sales result.
function RejectedResult({ data, onViewTimeline }) {
  const rejection = data.rejection || {};
  return (
    <section className="card result-card result-rejected" aria-live="polite">
      <div className="card-head">
        <h2 className="card-title">
          <Icon name="shield" size={18} /> Rejected — Unsupported Task
        </h2>
        <span className="chip chip-warn">
          <Icon name="x" size={14} /> rejected
        </span>
      </div>

      <p>{rejection.reason || "This task is not supported."}</p>
      <p className="muted small">
        No tool was executed. The agent can only calculate total sales revenue or find the
        highest sale.
      </p>

      <dl className="kv">
        <div>
          <dt>Run ID</dt>
          <dd className="mono break">{data.runId}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>
            <span className={`chip ${rejection.flagged ? "chip-danger" : "chip-muted"}`}>
              {CATEGORY_LABEL[rejection.category] || rejection.category || "—"}
            </span>
          </dd>
        </div>
        <div>
          <dt>Stopped at</dt>
          <dd>{STAGE_LABEL[data.stage] || data.stage || "—"}</dd>
        </div>
        <div>
          <dt>Selected tool</dt>
          <dd className="muted">None</dd>
        </div>
        {rejection.flagged && (
          <div className="kv-wide">
            <dt>Review</dt>
            <dd>Flagged for review. This kind of request can indicate misuse.</dd>
          </div>
        )}
      </dl>

      {onViewTimeline && (
        <button className="btn btn-ghost" onClick={() => onViewTimeline(data.runId)}>
          Open in Activity Timeline <Icon name="arrow" size={16} />
        </button>
      )}
    </section>
  );
}

export default function AgentResult({ data, error, loading, onRetry, onViewTimeline }) {
  if (loading) {
    return (
      <section className="card result-card empty-state" aria-live="polite" aria-busy="true">
        <span className="spinner spinner-lg" aria-hidden="true" />
        <h2 className="card-title">Agent is running</h2>
        <p className="muted">
          Waiting for Workers AI to choose a tool. This usually takes a few seconds and
          gives up after 45 seconds.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card result-card result-error" aria-live="polite">
        <div className="card-head">
          <h2 className="card-title">
            <Icon name="x" size={18} /> Execution failed
          </h2>
          {error.status ? <span className="chip chip-danger">HTTP {error.status}</span> : null}
        </div>
        <p>{error.message}</p>
        <p className="muted small">
          No result is shown because the backend did not return a successful response.
        </p>
        <div className="form-actions">
          {onRetry && (
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="refresh" size={16} /> Retry
            </button>
          )}
          {error.runId && onViewTimeline && (
            <button className="btn btn-ghost btn-inline" onClick={() => onViewTimeline(error.runId)}>
              View failed run <Icon name="arrow" size={16} />
            </button>
          )}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card result-card empty-state">
        <Icon name="cpu" size={28} />
        <h2 className="card-title">No run yet</h2>
        <p className="muted">Submit a task to see the agent's decision and the tool result.</p>
      </section>
    );
  }

  if (data.status === "rejected") {
    return <RejectedResult data={data} onViewTimeline={onViewTimeline} />;
  }

  const ok = data.status === "completed";

  return (
    <section className="card result-card" aria-live="polite">
      <div className="card-head">
        <h2 className="card-title">Execution result</h2>
        <span className={`chip ${ok ? "chip-success" : "chip-danger"}`}>
          <Icon name={ok ? "check" : "x"} size={14} /> {data.status}
        </span>
      </div>

      <dl className="kv">
        <div>
          <dt>Run ID</dt>
          <dd className="mono break">{data.runId}</dd>
        </div>
        <div>
          <dt>Selected tool</dt>
          <dd>
            <span className="chip chip-accent mono">
              <Icon name="tool" size={14} /> {data.selectedTool}
            </span>
          </dd>
        </div>
        <div className="kv-wide">
          <dt>Agent's stated reason</dt>
          <dd className="reason">{data.reason}</dd>
        </div>
      </dl>

      <h3 className="section-label">Tool output</h3>
      <ResultBody result={data.result} />

      {onViewTimeline && (
        <button className="btn btn-ghost" onClick={() => onViewTimeline(data.runId)}>
          Open in Activity Timeline <Icon name="arrow" size={16} />
        </button>
      )}
    </section>
  );
}
