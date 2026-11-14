// Small inline SVG icon set (no icon library dependency).
const PATHS = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  play: "M6 4l14 8-14 8z",
  timeline: "M12 2v20M5 6h4M5 12h4M5 18h4M15 6h4M15 12h4M15 18h4",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "M6 6l12 12M18 6L6 18",
  shield: "M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z",
  refresh: "M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  cpu: "M9 9h6v6H9zM4 4h16v16H4zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3",
  tool: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v7H2v-7z",
  flag: "M4 22V4M4 4h13l-2 4 2 4H4",
  brain: "M12 4a3 3 0 0 0-3 3 3 3 0 0 0-3 3 3 3 0 0 0 1 5 3 3 0 0 0 5 2zM12 4a3 3 0 0 1 3 3 3 3 0 0 1 3 3 3 3 0 0 1-1 5 3 3 0 0 1-5 2zM12 4v16",
  arrow: "M5 12h14M13 6l6 6-6 6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  logout: "M9 21H5V3h4M16 17l5-5-5-5M21 12H9"
};

export default function Icon({ name, size = 18, className = "" }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || ""} />
    </svg>
  );
}
