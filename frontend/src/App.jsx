import { useEffect, useState } from "react";
import Sidebar, { NAV_ITEMS } from "./components/Sidebar.jsx";
import Header from "./components/Header.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AgentExecution from "./pages/AgentExecution.jsx";
import TimelinePage from "./pages/TimelinePage.jsx";
import RunHistory from "./pages/RunHistory.jsx";
import SecurityAlerts from "./pages/SecurityAlerts.jsx";
import useAgentExecution from "./hooks/useAgentExecution.js";
import useAuth from "./hooks/useAuth.js";
import Login from "./pages/Login.jsx";

const VALID_PAGES = NAV_ITEMS.map((item) => item.id);

function pageFromHash() {
  const page = window.location.hash.replace("#", "");
  return VALID_PAGES.includes(page) ? page : "execution";
}

export default function App() {
  const auth = useAuth();

  // Nothing private is fetched until the server confirms the session.
  if (auth.status !== "authenticated") {
    return (
      <Login
        status={auth.status}
        configured={auth.configured}
        onLogin={auth.login}
        onRetry={auth.refresh}
      />
    );
  }

  return <AuthenticatedApp onLogout={auth.logout} />;
}

function AuthenticatedApp({ onLogout }) {
  const [page, setPage] = useState(pageFromHash);
  const [navOpen, setNavOpen] = useState(false);
  const [timelineRunId, setTimelineRunId] = useState(null);
  const execution = useAgentExecution();

  // Keep the page in the URL hash so refresh/back work.
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function navigate(next) {
    setNavOpen(false);
    if (window.location.hash !== `#${next}`) window.location.hash = next;
    setPage(next);
  }

  function openTimeline(runId) {
    setTimelineRunId(runId);
    navigate("timeline");
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar
        active={page}
        onNavigate={navigate}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <div className="main-col">
        <Header onMenu={() => setNavOpen(true)} onLogout={onLogout} />
        <main id="main" className="content">
          {page === "dashboard" && <Dashboard onNavigate={navigate} onOpenTimeline={openTimeline} />}
          {page === "execution" && (
            <AgentExecution execution={execution} onOpenTimeline={openTimeline} />
          )}
          {page === "timeline" && (
            <TimelinePage runId={timelineRunId || execution.runId} onSelectRun={setTimelineRunId} />
          )}
          {page === "history" && <RunHistory onOpenTimeline={openTimeline} />}
          {page === "alerts" && <SecurityAlerts onOpenTimeline={openTimeline} />}
        </main>
      </div>
    </div>
  );
}
