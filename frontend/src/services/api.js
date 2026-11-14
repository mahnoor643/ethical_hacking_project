// Thin wrapper around fetch for the Worker API.
// All requests go to relative /api paths: same origin in production
// (one Cloudflare Worker serves the app and the API), proxied by Vite in dev.
// The session lives in an HttpOnly cookie; JavaScript never sees it.

// The Worker allows 2 AI attempts of 15 s each plus D1 writes (~31 s worst
// case), so the browser waits a little longer before giving up.
export const AGENT_TIMEOUT_MS = 45000;
const DEFAULT_TIMEOUT_MS = 10000;
export const HEALTH_TIMEOUT_MS = 5000;

// Developer hint only shown when running the Vite dev server.
const BACKEND_HINT = import.meta.env.DEV
  ? " Make sure \"wrangler dev --port 8787\" is running."
  : " Please check your connection and try again.";

// Fired when the server says the session is missing or expired.
export const AUTH_REQUIRED_EVENT = "aal:auth-required";

export class ApiError extends Error {
  constructor(message, status, { runId = null, timedOut = false, data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    // Set when a failed agent run was still recorded in D1.
    this.runId = runId;
    this.timedOut = timedOut;
    // Parsed JSON body of an error response (e.g. a 422 rejection).
    this.data = data;
  }
}

async function request(path, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...options } = {}) {
  // Abort on our own timeout or when the caller cancels.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  let response;
  let text;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
    text = await response.text();
  } catch {
    if (timedOut) {
      throw new ApiError(
        `The backend did not respond within ${Math.round(timeoutMs / 1000)} seconds.${BACKEND_HINT}`,
        0,
        { timedOut: true }
      );
    }
    if (signal?.aborted) throw new ApiError("Request cancelled", 0);
    throw new ApiError(`Cannot reach the backend.${BACKEND_HINT}`, 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  // The Worker returns JSON for every /api route.
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    }
    // No JSON body means the error did not come from the Worker.
    const message =
      (data && typeof data.error === "string" && data.error) ||
      `Backend not reachable (HTTP ${response.status}).${BACKEND_HINT}`;
    const runId = data && typeof data.runId === "string" ? data.runId : null;
    throw new ApiError(message, response.status, { runId, data });
  }

  if (data === null) {
    throw new ApiError("Backend returned an unexpected response", response.status);
  }

  return data;
}

export function checkHealth(signal) {
  return request("/api/health", { signal, timeoutMs: HEALTH_TIMEOUT_MS });
}

export function getSession() {
  return request("/api/auth/session");
}

export function login(code) {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ code }) });
}

export function logout() {
  return request("/api/auth/logout", { method: "POST", body: "{}" });
}

export function runAgent(task) {
  return request("/api/agent/run", {
    method: "POST",
    body: JSON.stringify({ task }),
    timeoutMs: AGENT_TIMEOUT_MS
  });
}

export function getRuns() {
  return request("/api/runs");
}

export function getRunLogs(runId, signal) {
  return request(`/api/runs/${encodeURIComponent(runId)}/logs`, { signal });
}

export function getAlerts({ severity } = {}) {
  const query = severity ? `?severity=${encodeURIComponent(severity)}` : "";
  return request(`/api/alerts${query}`);
}
