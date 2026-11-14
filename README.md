# Agent Activity Logger — AI Security Monitoring Dashboard

An AI agent whose every decision, tool call and security event is recorded in a database, with a React dashboard to review the activity. Ethical Hacking university project (Project 19, Agentic AI Security).

**Live:** https://agent-activity-logger.mahnoort643.workers.dev. Access-code protected. Deployed 14 November 2026.

## Architecture

All of this runs as **one Cloudflare Worker** on the free `workers.dev` subdomain:

```
Browser ──HTTPS──► Cloudflare Worker "agent-activity-logger"
                    ├─ /            React 19 + Vite build (Workers Static Assets, SPA fallback)
                    └─ /api/*       TypeScript API (worker/src)
                          ├─ auth.ts       access code → HMAC-signed HttpOnly session cookie
                          ├─ ratelimit.ts  D1-backed per-client and daily limits
                          ├─ policy.ts     server-side task screen + tool relevance gate
                          ├─ agent.ts      Workers AI (llama-4-scout) tool selection, timeout/retry
                          ├─ tools.ts      allow-listed tools: calculateTotal, findHighestSale
                          ├─ logger.ts     activity log writes
                          └─ alerts.ts     security alert classification and writes
                                 │
                    Workers AI ◄─┘└─► Cloudflare D1 "agent-activity-db"
                                       agent_runs · activity_logs · security_alerts · rate_limits
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Worker + D1 status (no data) |
| GET | `/api/auth/session` | public | Is the current browser signed in? |
| POST | `/api/auth/login` | public, rate-limited | `{ "code": "…" }` → session cookie |
| POST | `/api/auth/logout` | public | Clears the session cookie |
| POST | `/api/agent/run` | session | `{ "task": "…" }`: run the agent (rate-limited) |
| GET | `/api/runs` | session | Latest 50 runs |
| GET | `/api/runs/{runId}/logs` | session | Activity timeline of one run |
| GET | `/api/alerts[?severity=&runId=]` | session | Security alerts + severity summary |

The API answers wrong methods with `405` (plus an `Allow` header) and unknown API paths with a JSON `404`. Run responses: `200` completed, `422` rejected, `429` rate-limited, `503` AI quota reached, `504` AI timeout.

## Security features

- **Access control:** a shared access code (Worker secret) is exchanged for an 8-hour HMAC-SHA-256-signed cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api`). Every endpoint that shows or creates private data requires it. Without the secrets configured, the API **fails closed**.
- **CSRF defence:** state-changing requests must be `application/json` and same-origin.
- **Tool allow-listing:** the AI can only *request* `calculateTotal` or `findHighestSale`. Unknown tools are blocked, logged as `tool_blocked`, and raise a high-severity alert. They are never executed.
- **Relevance gate:** an allow-listed tool runs only if it actually fits the task. At most 1 tool runs per task.
- **Policy screen before AI:** destructive, out-of-scope, sensitive-data and instruction-override requests are rejected without calling the AI.
- **Security alerts:** recorded in D1 with run ID, severity, category, description and timestamp.

| Category | Severity | Raised when |
|---|---|---|
| `unauthorized_tool_selection` | high | AI picks a tool outside the allow-list |
| `instruction_override_attempt` | high | task tries to override the agent's instructions |
| `sensitive_data_request` | medium | task asks for passwords, keys, card data… |
| `ai_tool_mismatch` | low | AI picks an allow-listed tool that doesn't fit |
| `ai_inference_failure` | low/medium | AI error or timeout after retry |
| `repeated_ai_failures` | high | ≥3 AI failures within 60 minutes |
| `ai_quota_exhausted` | medium | daily AI budget reached |

Plain unsupported tasks (e.g. "Delete sales record", "Tell me a joke") are rejected and logged **without** an alert.

- **Rate limiting and usage protection (server-side, in D1):**

| Limit | Value |
|---|---|
| Runs per client per minute | 5 |
| Runs per client per hour | 40 |
| Runs per day (whole site) | 200 |
| Workers AI calls per day (incl. retries) | 300 |
| Login attempts per client | 10 per 15 min |
| Task length | 500 characters |
| Request body | 4 KB |
| AI attempts per task | 2 (retry only after a 15 s timeout) |
| AI output | `max_tokens` 150 |

- **Headers:** CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS on the app. API responses also send `Cache-Control: no-store`.
- **SQL:** all queries are parameterised.

## Free-tier configuration

The app uses only Workers Free (100,000 requests/day), Workers Static Assets, D1 Free (5M rows read / 100k written per day) and the Workers AI free allocation (10,000 neurons/day). There is no custom domain or paid add-on, and no Cloudflare Access (its onboarding asks for payment details).

On the Free plan, exceeding a limit returns errors rather than charges. The 300 AI calls/day cap uses at most about 4,000 neurons, about 40% of the free allocation.

## Local development

```powershell
npm.cmd install
cd frontend; npm.cmd install; cd ..
npx.cmd wrangler login
npm.cmd run db:migrate:local          # local D1 in .wrangler/state
# .dev.vars (gitignored) must contain ACCESS_CODE=... and SESSION_SECRET=... (32+ chars)
npm.cmd run dev                       # Worker on http://127.0.0.1:8787
cd frontend; npm.cmd run dev          # React on http://localhost:5173 (proxies /api)
```

Note: `wrangler dev` uses the **real** Workers AI, and those calls count toward the free allocation.

## Tests

```powershell
npm.cmd run typecheck   # TypeScript
npm.cmd test            # 69 tests: in-memory SQLite built from ./migrations + fake AI (no real AI/D1 calls)
npm.cmd run check       # typecheck + tests + frontend build + wrangler deploy --dry-run
```

## Deploying updates

```powershell
npm.cmd run check                                         # everything must pass
npx.cmd wrangler d1 migrations list agent-activity-db --remote   # see pending DB changes (read-only)
npx.cmd wrangler d1 migrations apply agent-activity-db --remote  # only if a NEW migration was added
npm.cmd run deploy                                        # typecheck + test + build + wrangler deploy
```

Secrets are kept across deploys.

- **Rotate the access code:** run `npx.cmd wrangler secret put ACCESS_CODE` and type the new value at the prompt. Existing sessions stay valid until they expire.
- **Sign everyone out:** change `SESSION_SECRET`.
- **Your copy of the code:** the current production values are in `.secrets/production.json`, which is gitignored and must never be committed.

## Documentation

- `docs/PROJECT_SUMMARY.md`
- `docs/Agent_Activity_Logger_Final_Report.md` (also `.docx` and `.pdf`)
- `docs/VIVA_QUESTIONS_AND_ANSWERS.md`
- `docs/test-evidence/`
- `docs/screenshots/`
