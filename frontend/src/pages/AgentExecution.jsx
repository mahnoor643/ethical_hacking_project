import TaskForm from "../components/TaskForm.jsx";
import AgentResult from "../components/AgentResult.jsx";
import ActivityTimeline from "../components/ActivityTimeline.jsx";

// `execution` comes from useAgentExecution() in App.
export default function AgentExecution({ execution, onOpenTimeline }) {
  const { loading, result, error, runId, execute, retry, finishedAt } = execution;

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Agent Execution</h2>
        <p className="page-sub">
          Send a task to the Cloudflare Workers AI agent. Every step is logged to D1.
        </p>
      </div>

      <div className="grid-2">
        <div className="stack">
          <TaskForm onSubmit={execute} loading={loading} />
          <AgentResult
            data={result}
            error={error}
            loading={loading}
            onRetry={retry}
            onViewTimeline={onOpenTimeline}
          />
        </div>
        {/* finishedAt reloads the timeline after every run, failed ones included. */}
        <ActivityTimeline runId={runId} waiting={loading} refreshKey={finishedAt} />
      </div>
    </div>
  );
}
