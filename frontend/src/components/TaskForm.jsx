import { useId, useState } from "react";
import Icon from "./Icon.jsx";

export const MAX_TASK_LENGTH = 500;

const EXAMPLES = [
  "Find the highest sale",
  "Calculate total sales revenue"
];

// Mirrors the Worker's input-shape checks (empty / too long) only.
// Whether a task is supported is decided server-side, so every
// rejection is recorded in D1 and shown as "Rejected — Unsupported Task".
export function validateTask(value) {
  const task = value.trim();
  if (!task) return "Please describe a task for the agent.";
  if (value.length > MAX_TASK_LENGTH) {
    return `Task must be ${MAX_TASK_LENGTH} characters or fewer.`;
  }
  return null;
}

export default function TaskForm({ onSubmit, loading, error }) {
  const [task, setTask] = useState("Find the highest sale");
  const [validationError, setValidationError] = useState(null);
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  function handleSubmit(event) {
    event.preventDefault();
    const problem = validateTask(task);
    setValidationError(problem);
    if (problem || loading) return;
    onSubmit(task.trim());
  }

  const shownError = validationError || error;
  const remaining = MAX_TASK_LENGTH - task.length;

  return (
    <form className="card task-form" onSubmit={handleSubmit} noValidate>
      <div className="card-head">
        <div>
          <h2 className="card-title">Run an AI agent task</h2>
          <p className="card-sub">
            The agent runs an approved tool only if it fits the task. Anything else is
            rejected and nothing runs.
          </p>
        </div>
        <span className="chip chip-muted">
          <Icon name="shield" size={14} /> Allow-listed tools only
        </span>
      </div>

      <label className="field-label" htmlFor={id}>
        Task description
      </label>
      <textarea
        id={id}
        className={`textarea ${shownError ? "has-error" : ""}`}
        value={task}
        maxLength={MAX_TASK_LENGTH}
        rows={4}
        required
        disabled={loading}
        placeholder="Describe a sales analysis task, e.g. “Find the highest sale” or “Calculate total sales revenue”."
        aria-invalid={Boolean(shownError)}
        aria-describedby={`${hintId}${shownError ? ` ${errorId}` : ""}`}
        onChange={(event) => {
          setTask(event.target.value);
          if (validationError) setValidationError(null);
        }}
      />

      <div className="field-meta" id={hintId}>
        <div className="examples">
          <span className="examples-label">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="chip chip-button"
              disabled={loading}
              onClick={() => {
                setTask(example);
                setValidationError(null);
              }}
            >
              {example}
            </button>
          ))}
        </div>
        <span className={`counter ${remaining < 50 ? "counter-warn" : ""}`}>
          {task.length}/{MAX_TASK_LENGTH}
        </span>
      </div>

      {shownError && (
        <div className="alert alert-error" id={errorId} role="alert">
          <Icon name="alert" size={16} />
          <span>{shownError}</span>
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" /> Running agent…
            </>
          ) : (
            <>
              <Icon name="play" size={16} /> Run AI Agent
            </>
          )}
        </button>
        {loading && (
          <span className="muted small" aria-live="polite">
            Waiting for Workers AI to choose a tool…
          </span>
        )}
      </div>
    </form>
  );
}
