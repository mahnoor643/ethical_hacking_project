import Icon from "./Icon.jsx";

export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "execution", label: "Agent Execution", icon: "play" },
  { id: "timeline", label: "Activity Timeline", icon: "timeline" },
  { id: "history", label: "Run History", icon: "history" },
  { id: "alerts", label: "Security Alerts", icon: "alert" }
];

export default function Sidebar({ active, onNavigate, open, onClose }) {
  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? "is-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="brand-mark">
            <Icon name="shield" size={20} />
          </span>
          <div>
            <div className="brand-name">AgentLog</div>
            <div className="brand-sub">Security Monitor</div>
          </div>
          <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Close navigation">
            <Icon name="close" />
          </button>
        </div>

        <nav>
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  className={`nav-item ${active === item.id ? "is-active" : ""}`}
                  aria-current={active === item.id ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-label">Stack</div>
          <div>Cloudflare Workers · Workers AI · D1</div>
        </div>
      </aside>
    </>
  );
}
