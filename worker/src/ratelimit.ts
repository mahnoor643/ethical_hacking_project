
// Server-side, D1-backed fixed-window rate limiting.
//
// Counters live in the rate_limits table, so limits survive page
// refreshes, new tabs, cleared cookies and Worker restarts. Client IPs
// are stored only as truncated SHA-256 hashes.

export interface LimitRule {
  name: string;
  windowSeconds: number;
  limit: number;
}

// Conservative limits: they keep usage far inside the free tier
// (Workers AI: 10,000 neurons/day; D1: 100,000 rows written/day).
export const LIMITS = {
  // Login attempts per client IP.
  login: { name: "login", windowSeconds: 15 * 60, limit: 10 },
  // Agent runs per client IP.
  runPerMinute: { name: "run-min", windowSeconds: 60, limit: 5 },
  runPerHour: { name: "run-hour", windowSeconds: 60 * 60, limit: 40 },
  // Agent runs for the whole site per UTC day.
  runPerDay: { name: "run-day", windowSeconds: 24 * 60 * 60, limit: 200 },
  // Workers AI calls (incl. retries) for the whole site per UTC day.
  // ~13 neurons per call with llama-4-scout => <= ~4,000 neurons/day.
  aiCallsPerDay: { name: "ai-day", windowSeconds: 24 * 60 * 60, limit: 300 }
} satisfies Record<string, LimitRule>;

export interface LimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

// Counts one hit and reports whether it is within the limit.
// Windows are aligned to the epoch, so daily windows reset at 00:00 UTC
// (the same time the Workers AI free allocation resets).
export async function hit(
  db: D1Database,
  rule: LimitRule,
  key: string,
  nowMs: number = Date.now()
): Promise<LimitResult> {
  const nowSec = Math.floor(nowMs / 1000);
  const windowStart = nowSec - (nowSec % rule.windowSeconds);

  const row = await db.prepare(
    `INSERT INTO rate_limits (bucket, window_start, count)
     VALUES (?, ?, 1)
     ON CONFLICT (bucket, window_start)
     DO UPDATE SET count = count + 1
     RETURNING count`
  )
  .bind(`${rule.name}:${key}`, windowStart)
  .first<{ count: number }>();

  const count = Number(row?.count ?? 1);
  return {
    allowed: count <= rule.limit,
    count,
    limit: rule.limit,
    retryAfterSeconds: windowStart + rule.windowSeconds - nowSec
  };
}

// Checks several rules; stops counting at the first one exceeded.
export async function hitAll(
  db: D1Database,
  rules: Array<[LimitRule, string]>,
  nowMs?: number
): Promise<LimitResult | null> {
  for (const [rule, key] of rules) {
    const result = await hit(db, rule, key, nowMs);
    if (!result.allowed) return result;
  }
  return null;
}

// Removes counters from windows that ended more than two days ago.
export async function pruneOldWindows(db: D1Database, nowMs: number = Date.now()) {
  const cutoff = Math.floor(nowMs / 1000) - 2 * 24 * 60 * 60;
  await db.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(cutoff).run();
}

// Stable, non-reversible identifier for the caller.
export async function clientKey(request: Request): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
