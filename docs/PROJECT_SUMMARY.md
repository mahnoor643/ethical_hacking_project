# Agent Activity Logger — Project Summary

**Project 19 · Category: Agentic AI Security · Course: Ethical Hacking**

**Live:** https://agent-activity-logger.mahnoort643.workers.dev. Deployed 14 November 2026 on Cloudflare's free tier. Access-code protected.

## What it is

The Agent Activity Logger is a working AI agent whose every decision and tool call is recorded in a database, together with the reason for that step, so it can be reviewed later. A React dashboard replays each run as a timeline.

## How it works

1. A signed-in user submits a sales-analysis task (e.g., *"Find the highest sale"*).
2. The Worker checks the session and the rate limits, validates the input and creates a run record in Cloudflare D1.
3. A server-side policy screen rejects destructive, out-of-scope, sensitive-data and instruction-override tasks **before** the AI is called.
4. The Worker asks Workers AI (`@cf/meta/llama-4-scout-17b-16e-instruct`) to choose **one of two allow-listed tools**, or to decline.
5. The Worker validates the model's JSON and blocks any tool not on the allow-list. A relevance gate then checks that the tool actually fits the task, and only then is the tool run (at most one per task).
6. Every stage is written to D1. Suspicious events also create a **security alert** linked to the run.
7. The dashboard shows the result, run history, a step-by-step timeline and the Security Alerts page.

## Technology

React 19 + Vite 8 · Cloudflare Workers (TypeScript) + Workers Static Assets · Workers AI · Cloudflare D1 (SQLite) · Wrangler 4. Frontend and API are served by **one Worker**: `/` is the React app and `/api/*` is the backend.

## Original requirements vs. delivery

| Requirement | Status |
|---|---|
| Log each agent step with a reason | Implemented & Tested |
| Store activities in a file or database | Implemented & Tested (Cloudflare D1) |
| Simple timeline viewer | Implemented & Tested |

**Additional features:** tool allow-listing with server-side validation, failed-run logging with a "View failed run" link, a 15 s AI timeout with one logged retry, client and server input validation, Run History, Dashboard statistics, backend connection monitoring, and a responsive layout.

**Added for the production deployment (14 Nov 2026):**

| Feature | Status |
|---|---|
| Security Alerts module: 7 categories, 3 severities, linked to run IDs, read-only API, real dashboard page | Implemented & Tested |
| Access-code authentication with a signed HttpOnly session cookie; fails closed | Implemented & Tested |
| Server-side rate limiting and a daily AI budget (stored in D1) | Implemented & Tested |
| Prompt-injection / instruction-override detection (pattern-based, before the AI) | Implemented & Tested |
| Fixes: `tool_call` no longer left `running`; HTTP 405 for wrong methods; no dev hints in production; duplicate timeline request removed | Implemented & Tested |
| Production deployment on the free `workers.dev` subdomain | Implemented & Tested |

*Earlier status (before 14 Nov 2026), kept for the record:* Security Alerts were only partially implemented. Authentication, rate limiting, prompt-injection detection and production deployment were not implemented.

**Still not implemented:** tamper-evident logs, multi-user accounts/roles.

## Verified results: production deployment (14 Nov 2026)

- **Static checks:** TypeScript type-check passes. **69/69 automated tests pass.** They run against an in-memory SQLite database built from the real migrations, with a fake AI.
- **End-to-end:** 25/25 checks passed against a local Worker with a separate test database, and **25/25 against the live URL**. Each run made only 2 real AI calls.
- **Real AI:** *"Find the highest sale"* selected `findHighestSale` (Laptop, 50,000). *"Calculate total sales revenue"* selected `calculateTotal` (90,000).
- **Access control:** all private endpoints return `401` without a session, including the AI endpoint. Wrong codes return `401`, and the cookie is not readable from JavaScript.
- **Alerts:** the instruction-override attempt created a high-severity alert linked to its run. The unsupported task created none.
- **Rate limiting:** the 6th run in a minute was refused with `429`.
- **Live UI:** a headless-browser check at phone width (390 px) and desktop width found no horizontal scroll and no console errors. Refreshing works and deep links do not 404.

Evidence: `docs/test-evidence/production_deployment_2026-11-14.txt`, `unit_tests_2026-11-14_deployment.txt`, `docs/screenshots/prod_*.png`.

## Verified results (earlier round: tested 14 Nov 2026, local Worker + real Workers AI)

- **43 test cases: 39 PASS, 0 FAIL, 4 NOT TESTED.**
- Tool choice matched task intent in 39/39 historical development runs and in every test run without an injection attempt.
- A prompt-injection attempt asked for a non-existent `deleteAllSales` tool. The model's output was **rejected by the allow-list**; the run was marked failed and fully logged.
- SQL payloads were stored as inert text, HTML payloads were rendered as text, and malformed run IDs were rejected with `400`.
- AI timeouts occurred naturally: a 15 s timeout was followed by a logged `ai_retry` and a successful second attempt.
- With the dashboard open, a stopped backend was detected within 14 s; after a restart, the status reconnected within about 11 s with no page reload.

Evidence: `docs/test-evidence/` and `docs/screenshots/`.

## Key limitations

- Single-step agent with two read-only tools on dummy data.
- One shared access code: no individual user accounts or roles.
- Injection detection is pattern-based, so it can be bypassed by rephrasing. The allow-list and relevance gate still contain such attempts.
- Logs are mutable.
- History shows only the latest 50 runs and 100 alerts.
- `/api/health` is public. Like any public Worker, heavy traffic could use up the free 100,000 requests/day. When that happens, the site returns errors and nothing is billed.

## Deployment status

**Deployed:** https://agent-activity-logger.mahnoort643.workers.dev. It runs on the Cloudflare Workers Free plan and uses remote D1 `agent-activity-db` (migrations 0001–0002 applied 14 Nov 2026). Update commands are in `README.md`.

## Deliverables

- `docs/Agent_Activity_Logger_Final_Report.md` / `.docx` / `.pdf`
- `docs/PROJECT_SUMMARY.md`
- `docs/VIVA_QUESTIONS_AND_ANSWERS.md`
- `README.md` (setup, deployment, maintenance)
- `docs/screenshots/` (17 development screenshots + 7 production `prod_*.png`)
- `docs/test-evidence/` (raw test results)