import { useCallback, useEffect, useState } from "react";
import { getRuns } from "../services/api.js";

// Loads recent runs from GET /api/runs.
export default function useRuns() {
  const [state, setState] = useState({ loading: true, error: null, runs: [] });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await getRuns();
      setState({ loading: false, error: null, runs: Array.isArray(data.runs) ? data.runs : [] });
    } catch (error) {
      setState({ loading: false, error, runs: [] });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
