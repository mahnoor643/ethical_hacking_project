import { useCallback, useRef, useState } from "react";
import { runAgent } from "../services/api.js";

// Agent execution state lives in App (not the page) so switching pages
// mid-run doesn't lose the result or invite a duplicate run.
export default function useAgentExecution() {
  const [state, setState] = useState({
    loading: false,
    result: null,
    error: null,
    runId: null,
    lastTask: null,
    finishedAt: 0
  });
  // Synchronous guard: blocks a second request before React re-renders.
  const inFlight = useRef(false);

  const execute = useCallback(async (task) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, result: null, error: null, runId: null, lastTask: task }));

    // One state update per run outcome, so the timeline loads exactly once.
    let outcome;
    try {
      const data = await runAgent(task);
      outcome = { result: data, error: null, runId: data.runId };
    } catch (error) {
      // HTTP 422 = the server rejected the task (no tool ran). That is a
      // recorded outcome, not a transport error, so show it as a result.
      if (error.status === 422 && error.data?.status === "rejected") {
        outcome = { result: error.data, error: null, runId: error.data.runId || null };
      } else {
        // A failed run is still logged in D1; keep its ID for the timeline.
        outcome = { result: null, error, runId: error.runId || null };
      }
    } finally {
      inFlight.current = false;
    }
    setState((s) => ({ ...s, ...outcome, loading: false, finishedAt: Date.now() }));
  }, []);

  const retry = useCallback(() => {
    if (state.lastTask) execute(state.lastTask);
  }, [execute, state.lastTask]);

  return { ...state, execute, retry };
}
