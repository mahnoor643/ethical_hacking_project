
import { AIQuotaError, AgentRunError, runAgent } from "./agent.ts";
import { ALERT_SEVERITIES } from "./alerts.ts";
import {
  checkAccessCode,
  clearedSessionCookie,
  createSessionToken,
  getSession,
  isAuthConfigured,
  sessionCookie,
  SESSION_TTL_SECONDS,
  type AuthEnv
} from "./auth.ts";
import { LIMITS, clientKey, hit, hitAll, pruneOldWindows } from "./ratelimit.ts";

export interface Env extends AuthEnv {
  DB: D1Database;
  AI: Ai;
  // Static assets (the React build). Absent in unit tests.
  ASSETS?: Fetcher;
}

// Run IDs are generated with crypto.randomUUID().
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Note: the main module must only export the default handler (and types):
// workerd treats every other named export as an entrypoint.
const MAX_TASK_LENGTH = 500;
// Request bodies are tiny JSON objects; refuse anything larger.
const MAX_BODY_BYTES = 4096;

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer"
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, {
    status,
    headers: { ...SECURITY_HEADERS, ...headers }
  });
}

function methodNotAllowed(allowed: string[]): Response {
  return json({ error: "Method not allowed" }, 405, { Allow: allowed.join(", ") });
}

function tooManyRequests(retryAfterSeconds: number, message: string): Response {
  return json(
    { error: message, retryAfterSeconds },
    429,
    { "Retry-After": String(Math.max(1, retryAfterSeconds)) }
  );
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// CSRF defence in depth (the cookie is already SameSite=Strict):
// state-changing requests must be JSON and same-origin. The Vite dev
// proxy forwards a localhost Origin to a localhost Worker, which is allowed.
function isSameOriginJson(request: Request, url: URL): boolean {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/json")) return false;

  const origin = request.headers.get("Origin");
  if (!origin) return true; // Non-browser clients (curl, tests).
  try {
    const o = new URL(origin);
    if (o.origin === url.origin) return true;
    return LOCAL_HOSTS.has(o.hostname) && LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: "Request body too large" }, 413) };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: "Request body too large" }, 413) };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: json({ error: "Request body must be valid JSON" }, 400) };
  }
}

// Route table: path pattern -> allowed methods. Used for 404 vs 405.
const ROUTES: Array<[RegExp, string[]]> = [
  [/^\/api\/health$/, ["GET"]],
  [/^\/api\/auth\/session$/, ["GET"]],
  [/^\/api\/auth\/login$/, ["POST"]],
  [/^\/api\/auth\/logout$/, ["POST"]],
  [/^\/api\/agent\/run$/, ["POST"]],
  [/^\/api\/runs$/, ["GET"]],
  [/^\/api\/runs\/[^/]+\/logs$/, ["GET"]],
  [/^\/api\/alerts$/, ["GET"]]
];

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = request.method === "HEAD" ? "GET" : request.method;

  const route = ROUTES.find(([pattern]) => pattern.test(path));
  if (!route) return json({ error: "Not found" }, 404);
  if (!route[1].includes(method)) return methodNotAllowed(route[1]);

  // ---------- public endpoints ----------

  // Health: proves the Worker answers and D1 is reachable.
  // Reveals no data and no configuration details.
  if (path === "/api/health") {
    let database = "ok";
    try {
      await env.DB.prepare("SELECT 1").first();
    } catch {
      database = "error";
    }
    return json({
      status: database === "ok" ? "success" : "degraded",
      message: "Agent Activity Logger API is running!",
      database
    });
  }

  if (path === "/api/auth/session") {
    const expiresAt = await getSession(env, request);
    return json({
      authenticated: expiresAt !== null,
      expiresAt,
      configured: isAuthConfigured(env)
    });
  }

  if (path === "/api/auth/login") {
    if (!isSameOriginJson(request, url)) {
      return json({ error: "Cross-origin or non-JSON request refused" }, 403);
    }
    if (!isAuthConfigured(env)) {
      return json({ error: "Authentication is not configured on the server" }, 503);
    }

    const limited = await hit(env.DB, LIMITS.login, await clientKey(request));
    if (!limited.allowed) {
      return tooManyRequests(limited.retryAfterSeconds, "Too many login attempts. Please wait and try again.");
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body as { code?: unknown } | null;
    const code = body && typeof body.code === "string" ? body.code.trim() : "";

    if (!code || code.length > 200 || !(await checkAccessCode(env, code))) {
      return json({ error: "Invalid access code" }, 401);
    }

    const { token, expiresAt } = await createSessionToken(env);
    // Housekeeping for the rate-limit table (rare: only on login).
    try {
      await pruneOldWindows(env.DB);
    } catch {
      // Best-effort.
    }
    return json(
      { authenticated: true, expiresAt },
      200,
      { "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS) }
    );
  }

  if (path === "/api/auth/logout") {
    return json({ authenticated: false }, 200, { "Set-Cookie": clearedSessionCookie() });
  }

  // ---------- everything below requires a valid session ----------

  if (!isAuthConfigured(env)) {
    return json({ error: "Authentication is not configured on the server" }, 503);
  }
  if ((await getSession(env, request)) === null) {
    return json({ error: "Authentication required" }, 401);
  }

  // Run AI Agent
  if (path === "/api/agent/run") {
    if (!isSameOriginJson(request, url)) {
      return json({ error: "Cross-origin or non-JSON request refused" }, 403);
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    if (
      !body ||
      typeof body !== "object" ||
      !("task" in body) ||
      typeof body.task !== "string" ||
      !body.task.trim() ||
      body.task.length > MAX_TASK_LENGTH
    ) {
      return json({ error: `Task must be 1-${MAX_TASK_LENGTH} characters` }, 400);
    }

    const task = body.task.trim();

    // Server-side limits (D1-backed, so refreshing the page cannot reset them).
    const key = await clientKey(request);
    const limited = await hitAll(env.DB, [
      [LIMITS.runPerMinute, key],
      [LIMITS.runPerHour, key],
      [LIMITS.runPerDay, "global"]
    ]);
    if (limited) {
      return tooManyRequests(
        limited.retryAfterSeconds,
        `Rate limit reached (${limited.limit} agent runs per window). Please wait before running another task.`
      );
    }

    // Malformed input stops above with a 400. Well-formed tasks that
    // are out of scope, destructive, or unsupported go through
    // runAgent so the rejection is recorded in D1 (see policy.ts).
    try {
      const result = await runAgent(env, task, undefined, {
        // Daily budget for Workers AI calls, retries included.
        beforeAICall: async () => {
          const ai = await hit(env.DB, LIMITS.aiCallsPerDay, "global");
          if (!ai.allowed) throw new AIQuotaError("Daily AI call budget reached");
        }
      });

      // 422 so no client can mistake a rejection for a result.
      return json(result, result.status === "rejected" ? 422 : 200);
    } catch (error) {
      // Details stay in server logs only.
      console.error("API error:", error);

      if (error instanceof AgentRunError) {
        return json({ error: error.publicMessage, runId: error.runId }, error.httpStatus);
      }
      return json({ error: "Agent execution failed" }, 500);
    }
  }

  // Read-only: recent agent runs
  if (path === "/api/runs") {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, task, status, started_at, completed_at
         FROM agent_runs
         ORDER BY started_at DESC
         LIMIT 50`
      ).all();

      return json({ runs: results });
    } catch (error) {
      console.error("Runs query error:", error);
      return json({ error: "Could not load runs" }, 500);
    }
  }

  // Read-only: activity logs for one run
  const logsMatch = path.match(/^\/api\/runs\/([^/]+)\/logs$/);
  if (logsMatch) {
    const runId = logsMatch[1];

    if (!RUN_ID_PATTERN.test(runId)) {
      return json({ error: "Invalid run ID" }, 400);
    }

    try {
      const run = await env.DB.prepare(
        `SELECT id, task, status, started_at, completed_at
         FROM agent_runs
         WHERE id = ?`
      )
        .bind(runId)
        .first();

      if (!run) {
        return json({ error: "Run not found" }, 404);
      }

      const { results } = await env.DB.prepare(
        `SELECT id, run_id, event_type, action, reason,
                status, created_at
         FROM activity_logs
         WHERE run_id = ?
         ORDER BY id ASC`
      )
        .bind(runId)
        .all();

      return json({ run, logs: results });
    } catch (error) {
      console.error("Logs query error:", error);
      return json({ error: "Could not load activity logs" }, 500);
    }
  }

  // Read-only: security alerts (optionally for one run / one severity)
  if (path === "/api/alerts") {
    const runId = url.searchParams.get("runId");
    const severity = url.searchParams.get("severity");

    if (runId && !RUN_ID_PATTERN.test(runId)) {
      return json({ error: "Invalid run ID" }, 400);
    }
    if (severity && !(ALERT_SEVERITIES as readonly string[]).includes(severity)) {
      return json({ error: "Invalid severity" }, 400);
    }

    try {
      const { results } = await env.DB.prepare(
        `SELECT a.id, a.run_id, a.severity, a.category, a.description,
                a.created_at, r.task AS run_task, r.status AS run_status
         FROM security_alerts a
         LEFT JOIN agent_runs r ON r.id = a.run_id
         WHERE (? IS NULL OR a.run_id = ?)
           AND (? IS NULL OR a.severity = ?)
         ORDER BY a.id DESC
         LIMIT 100`
      )
        .bind(runId, runId, severity, severity)
        .all();

      const { results: counts } = await env.DB.prepare(
        `SELECT severity, COUNT(*) AS count FROM security_alerts GROUP BY severity`
      ).all<{ severity: string; count: number }>();

      const summary: Record<string, number> = { low: 0, medium: 0, high: 0 };
      for (const row of counts) summary[row.severity] = Number(row.count);

      return json({ alerts: results, summary });
    } catch (error) {
      console.error("Alerts query error:", error);
      return json({ error: "Could not load security alerts" }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    // Everything else is the React app (served by Workers Static Assets).
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not Found", { status: 404 });
  }
};
