import { useEffect, useState } from "react";
import { checkHealth } from "../services/api.js";
import Icon from "./Icon.jsx";

const POLL_MS = 15000;
// Re-check sooner while disconnected so recovery shows up quickly.
const RETRY_MS = 4000;

const LABELS = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected"
};

// Shows whether the Worker answers /api/health.
// This only proves the API is reachable — not that AI or D1 work.
function useBackendStatus() {
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    let cancelled = false;
    let timer;
    const controller = new AbortController();

    async function poll() {
      let ok = false;
      try {
        const data = await checkHealth(controller.signal); // 5 s timeout
        ok = Boolean(data && data.status === "success");
      } catch {
        ok = false;
      }
      if (cancelled) return;
      setStatus(ok ? "connected" : "disconnected");
      timer = setTimeout(poll, ok ? POLL_MS : RETRY_MS);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return status;
}

export default function Header({ onMenu, onLogout }) {
  const status = useBackendStatus();

  return (
    <header className="header">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open navigation">
        <Icon name="menu" />
      </button>
      <div className="header-titles">
        <h1>Agent Activity Logger</h1>
        <p>AI Security Monitoring Dashboard</p>
      </div>
      <div
        className={`status-pill status-${status}`}
        role="status"
        aria-live="polite"
        title="Result of GET /api/health. Does not verify AI inference or D1 logging."
      >
        <span className="status-dot" />
        <span className="status-text">
          <span className="status-prefix">API </span>
          {LABELS[status]}
        </span>
      </div>
      {onLogout && (
        <button className="icon-btn" onClick={onLogout} aria-label="Sign out" title="Sign out">
          <Icon name="logout" />
        </button>
      )}
    </header>
  );
}
