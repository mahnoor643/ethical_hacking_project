// D1 CURRENT_TIMESTAMP values are UTC strings like "2026-11-14 09:15:02".
export function parseDbTime(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(value) {
  const date = parseDbTime(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function formatCurrency(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return `Rs. ${amount.toLocaleString("en-US")}`;
}

export function shortId(id) {
  return typeof id === "string" ? id.slice(0, 8) : "—";
}
