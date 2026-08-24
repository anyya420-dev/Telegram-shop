# TELEGRAM SHOP — FINAL PRODUCTION REPORT

## 1. Executive Summary

The repository was fully inspected, including application code, Render configuration, Prisma schema/migrations, bot runtime, frontend API/bootstrap flow, and the existing diagnostic files (`DIAGNOSTIC_REPORT.md`, `FINAL_PRODUCTION_AUDIT.md`, `PRODUCTION_TODO.md`).

The actual remaining production-blocking root cause in the repository was that the backend still ran `prisma migrate deploy` in the backend `prestart` hook. Because Render executes `npm run start --workspace backend`, the npm lifecycle ran migrations before `node dist/index.js`, which meant the service still could fail before binding `PORT` or serving `/health`. This undermined the previously-added background startup logic.

I fixed that by moving production migrations to Render `preDeployCommand` and leaving backend startup free to bind immediately. I also verified the repository-wide production URLs, CORS code, Telegram bootstrap/auth flow, readiness endpoints, tests, builds, and stale runtime URL references.

Live production verification from this environment was blocked by DNS/network resolution failure to the Render hosts, so production reachability and deployed commit matching could not be proven from here.

## 2. Current Production Architecture

- **Frontend service:** Render static site `Telegram-shop`
  - Public URL: `https://telegram-shop-3781.onrender.com`
  - Built from `frontend`
  - Production API base baked at build time from `VITE_API_URL`
- **Backend service:** Render web service `Narcos-shop`
  - Public URL: `https://narcos-shop.onrender.com`
  - API base: `https://narcos-shop.onrender.com/api`
  - Health check path: `/health`
- **Database:** Render PostgreSQL database `narcos-shop-db2.0`
  - Used by Prisma in `backend/prisma/schema.prisma`
- **Telegram bot:** Telegraf runtime started inside backend background initialization
  - Uses `WEB_APP_URL` for Web App button target
  - Standalone `/bot` package is for local development only
- **Authentication flow:** Telegram Mini App `initData` -> backend verification -> session token -> authenticated API requests

## 3. Exact Root Cause

**Exact root cause:** the backend startup path was still effectively blocked before the HTTP server started because `backend/package.json` had:

- `"prestart": "npm run db:generate && npm run db:migrate:deploy"`
- `"start": "node dist/index.js"`

On Render, `startCommand: npm run start --workspace backend` triggers npm lifecycle hooks, so `db:migrate:deploy` ran before `node dist/index.js`.

That meant:

1. Prisma migration/deployment work still happened before `app.listen()`.
2. If the database was unavailable, slow, or the migration step stalled, the backend never bound `PORT`.
3. Render could not reach `/health` even though application code had already been refactored to expose health endpoints and background initialization.
4. The Mini App then surfaced an opaque connection/network error because the API was not actually serving requests.

This was the key gap left by prior fixes: application startup order had been fixed in `backend/src/startup.ts`, but npm/Render startup order had not.

## 4. All Problems Found

1. **Production-blocking startup sequencing bug**
   - `prisma migrate deploy` still executed in backend `prestart` before the HTTP server could listen.
2. **Render deployment/config drift risk**
   - `render.yaml` now contains correct values, but existing Render services may still have stale dashboard values because `sync: false` variables and existing service configuration are not proven from the repository alone.
3. **Live production verification unavailable in this environment**
   - DNS resolution to the Render hosts failed, so live reachability/CORS verification could not be completed from here.
4. **Historical stale URL references remain in diagnostic documents**
   - `https://78j.onrender.com` still appears in old report files as historical evidence.
   - No active runtime/config code path still points to that stale host.
5. **No lint command exists in the repository**
   - Lint could not be run because no root or workspace lint script exists.

## 5. All Fixes Applied

1. **Moved production Prisma migrations out of npm `prestart`**
   - `backend/package.json`: `prestart` now runs only `db:generate`.
2. **Moved production migrations to Render deploy phase**
   - `render.yaml`: added `preDeployCommand: npm run db:migrate:deploy --workspace backend`.
3. **Updated repository documentation**
   - `README.md`: documented that production migrations must run in Render `preDeployCommand` so the backend can bind `PORT` and serve `/health` promptly.
4. **Created this consolidated production report**
   - Added `PRODUCTION_FINAL_REPORT.md` at repository root.

## 6. Files Changed

### `backend/package.json` (`/home/runner/work/Telegram-shop/Telegram-shop/backend/package.json`)
- Removed `npm run db:migrate:deploy` from `prestart`.
- Reason: prevent database migration work from blocking `node dist/index.js` and delaying or preventing binding to Render's `PORT`.

### `render.yaml` (`/home/runner/work/Telegram-shop/Telegram-shop/render.yaml`)
- Added `preDeployCommand: npm run db:migrate:deploy --workspace backend` to the backend service.
- Reason: keep migrations in the deploy lifecycle, but execute them before the new release becomes live rather than during process boot.

### `README.md` (`/home/runner/work/Telegram-shop/Telegram-shop/README.md`)
- Added deployment note describing why production migrations belong in Render `preDeployCommand`.
- Reason: document the startup constraint so the bug is not reintroduced.

### `PRODUCTION_FINAL_REPORT.md` (`/home/runner/work/Telegram-shop/Telegram-shop/PRODUCTION_FINAL_REPORT.md`)
- Added full technical investigation and final verification report.
- Reason: satisfy the final reporting requirement with one complete root-level file.

## 7. Frontend Configuration

Expected production configuration:

- `FRONTEND_URL=https://telegram-shop-3781.onrender.com`
- `WEB_APP_URL=https://telegram-shop-3781.onrender.com`
- `VITE_API_URL=https://narcos-shop.onrender.com/api`
- `ALLOW_DEMO_MODE=false`

Frontend production behavior verified from code:

- `frontend/src/lib/apiConfig.ts` requires `VITE_API_URL` to:
  - exist in production
  - be absolute
  - use HTTPS
  - point exactly to `/api`
  - not target `localhost`, `127.0.0.1`, `0.0.0.0`, or loopback variants
- `frontend/src/api/client.ts` uses `credentials: 'include'` and adds bearer/admin headers when present.
- `frontend/src/lib/telegram.ts` initializes Telegram WebApp and reads `initData` from `window.Telegram.WebApp`.
- `frontend/vite.config.ts` only proxies `/api` to `http://localhost:3001` in development.

## 8. Backend Configuration

Expected production backend configuration:

- `NODE_ENV=production`
- `PORT` provided by Render
- `DATABASE_URL` configured in Render
- `SESSION_SECRET` configured
- `TELEGRAM_BOT_TOKEN` configured, or active encrypted bot token already stored in DB
- `BOT_TOKEN_ENCRYPTION_KEY` configured
- `ADMIN_PASSWORD` configured
- `OWNER_TELEGRAM_ID` configured
- `FRONTEND_URL=https://telegram-shop-3781.onrender.com`
- `WEB_APP_URL=https://telegram-shop-3781.onrender.com`
- `ALLOW_DEMO_MODE=false`
- optional `CORS_ALLOWED_ORIGINS` only for extra explicit preview origins

Backend production safeguards verified from code:

- `backend/src/services/runtimeConfig.ts` validates required production variables.
- Production startup refuses invalid `ALLOW_DEMO_MODE` values.
- Production startup refuses invalid/missing `FRONTEND_URL`/`WEB_APP_URL`.
- Production startup refuses missing `SESSION_SECRET` and other critical variables.
- Demo mode is forced off in production even if an env value attempts to enable it.

## 9. CORS Analysis

### Allowed origins

Resolved from:

- `FRONTEND_URL`
- `WEB_APP_URL`
- optional `CORS_ALLOWED_ORIGINS`
- hardcoded production safety net: `https://telegram-shop-3781.onrender.com`

### Credentials

- `backend/src/middleware/cors.ts` sets `Access-Control-Allow-Credentials: true` for allowed origins.
- It never emits `Access-Control-Allow-Origin: *`.
- This is correct for credentialed cross-origin requests.

### OPTIONS

- OPTIONS is handled directly by the CORS middleware before auth, rate limiting, or body parsing.
- This satisfies the requirement that browser preflight must not be blocked by downstream middleware.

### Headers

Default allowed headers:

- `Content-Type`
- `Authorization`
- `X-Session-Token`
- `X-Admin-Token`
- `X-Requested-With`

For allowed preflight requests, requested headers are echoed when present.

### Methods

Allowed methods string:

- `GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS`

### Preflight behavior

- Allowed origin + valid preflight -> `204`
- Disallowed origin -> `403` JSON, no `Access-Control-Allow-Origin`
- No `Origin` header -> request is not blocked; health probes/curl continue to work without browser CORS headers
- `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers` is set

## 10. Telegram Mini App Authentication

Complete flow:

1. Telegram opens the Mini App at `WEB_APP_URL` / frontend URL.
2. Frontend initializes `window.Telegram.WebApp` in `frontend/src/lib/telegram.ts`.
3. Frontend reads `initData`.
4. `frontend/src/context/AppContext.tsx` calls `api.bootstrap({ initData })`.
5. `frontend/src/api/client.ts` sends `POST https://narcos-shop.onrender.com/api/session/bootstrap`.
6. Backend route `backend/src/routes/session.ts`:
   - validates `initData` type
   - rejects missing `initData` in production
   - loads active bot token
   - verifies Telegram signature with `verifyTelegramInitData()` in `backend/src/lib.ts`
   - checks auth date age and future skew
7. Backend upserts the user, creates cart state, evaluates admin/owner role, and returns:
   - `sessionToken`
   - user profile
   - cities
   - categories
   - admin flags
8. Frontend stores session token in memory and uses it on later API requests.

Security properties verified:

- Telegram auth was **not** removed.
- Demo mode is **not** allowed in production.
- `initData` must be a string.
- Forged or stale `initData` is rejected.

## 11. API Routes

Important routes verified:

- `GET /health` - public backend liveness
- `GET /api/health` - public API liveness
- `GET /ready` - readiness with database check
- `GET /api/ready` - readiness with database check
- `POST /api/session/bootstrap` - Telegram session bootstrap
- `GET /api/cities` - city list
- `GET /api/categories` - category list
- `GET /api/catalog` - product catalog
- `GET /api/products/:id` - product detail
- `GET/POST/PATCH/DELETE /api/cart*` - cart operations
- `GET/POST /api/orders*` - order operations
- `GET/PATCH /api/users*` - profile/city/language updates
- `GET/POST /api/balance*` - balance actions
- `POST /api/casino/spin` - casino action
- `GET/POST /api/support*` - support tickets
- `POST /api/discounts/validate` - discount validation
- `GET/POST/DELETE /api/reviews*` - reviews
- `GET/POST/DELETE /api/wishlist*` - wishlist
- `GET /api/delivery` - delivery options
- `/api/admin/*` - admin auth/settings/orders/users/products/bot/cities/categories/audit

## 12. Database

- ORM: Prisma (`backend/prisma/schema.prisma`)
- Provider: PostgreSQL
- Migrations present in `backend/prisma/migrations`
- Prisma client generation required before backend validation/build
- Readiness endpoints use a DB query to distinguish liveness from readiness
- User/session bootstrap persists users/carts/admin state in the database

Startup behavior after fix:

- Schema migrations run in Render `preDeployCommand`
- Backend process start is no longer blocked by `prisma migrate deploy`
- After process boot, app binds `PORT`
- Database-dependent initialization (`seedAdminConfigForFreshInstall`, Telegram bot init) runs in background with retry logic
- `/health` stays available even if DB-dependent background work is failing
- `/ready` and `/api/ready` surface database readiness state

## 13. Render Configuration

### Frontend service

- Type: static web service
- Name: `Telegram-shop`
- Build command: `npm install && npm run build --workspace frontend`
- Publish path: `frontend/dist`
- Required env:
  - `VITE_API_URL=https://narcos-shop.onrender.com/api`

### Backend service

- Type: node web service
- Name: `Narcos-shop`
- Build command: `npm install --include=dev && npm run build --workspace backend`
- **Pre-deploy command:** `npm run db:migrate:deploy --workspace backend`
- Start command: `npm run start --workspace backend`
- Health check path: `/health`
- Required env:
  - `NODE_ENV=production`
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `OWNER_TELEGRAM_ID`
  - `ADMIN_PASSWORD`
  - `BOT_TOKEN_ENCRYPTION_KEY`
  - `FRONTEND_URL=https://telegram-shop-3781.onrender.com`
  - `WEB_APP_URL=https://telegram-shop-3781.onrender.com`
  - `ALLOW_DEMO_MODE=false`
- Optional env:
  - `TELEGRAM_BOT_TOKEN`
  - `ADMIN_TELEGRAM_IDS`
  - `CORS_ALLOWED_ORIGINS`

### Deployment requirements

- Backend must bind Render `PORT` quickly.
- Health checks must not depend on Telegram auth.
- Existing Render dashboard env values must be confirmed manually.
- Telegram bot menu/web-app target must match the production frontend URL.

## 14. Tests

### Executed commands

- `npm test`
- `npm run typecheck`
- `npm run build`

### Result by executed backend test

`npm run test --workspace backend` -> **PASS**

1. GET /health is still served when the database is unavailable — PASS
2. GET /ready reports database availability when the readiness probe succeeds — PASS
3. GET /ready reports database failure when the readiness probe fails — PASS
4. GET /health is public and reports the service name — PASS
5. GET /api/health mirrors /health and requires no auth — PASS
6. GET /ready returns JSON readiness details without requiring auth — PASS
7. GET /health from the allowed origin returns credentialed CORS headers — PASS
8. OPTIONS /api/session/bootstrap preflight passes before auth and rate limiting — PASS
9. POST /api/session/bootstrap without initData is rejected in production — PASS
10. POST /api/session/bootstrap with a forged initData string is rejected — PASS
11. POST /api/session/bootstrap with a non-string initData returns 400 — PASS
12. unknown /api routes return JSON, never an HTML error page — PASS
13. an unlisted origin cannot reach /api/session/bootstrap — PASS
14. session token roundtrip uses SESSION_SECRET consistently — PASS
15. session token verification fails when SESSION_SECRET changes — PASS
16. session token creation fails in production when SESSION_SECRET is missing — PASS
17. verifyTelegramInitData accepts valid signed initData — PASS
18. verifyTelegramInitData rejects stale initData — PASS
19. verifyTelegramInitData rejects tampered hash — PASS
20. normalizeOrigin strips trailing slashes, paths and lowercases scheme + host — PASS
21. normalizeOrigin rejects empty and non-http values — PASS
22. allowed origin receives credentialed CORS headers and Vary: Origin — PASS
23. allowlist entry with a trailing slash still matches the browser Origin header — PASS
24. OPTIONS preflight for /api/session/bootstrap succeeds before auth middleware — PASS
25. disallowed origin is rejected with 403 and no Access-Control-Allow-Origin — PASS
26. disallowed origin preflight never returns CORS headers — PASS
27. requests without an Origin header (curl / health probes) are never blocked — PASS
28. CORS never emits a wildcard origin together with credentials — PASS
29. isOwnerTelegramId: true only for configured owner — PASS
30. isOwnerTelegramId: false when owner variable is missing — PASS
31. normalizeTelegramId normalizes string/number/bigint consistently — PASS
32. verifyAdminPassword returns configuration_error when ADMIN_PASSWORD is missing — PASS
33. verifyAdminPassword validates against ADMIN_PASSWORD when no AdminSecurity row exists — PASS
34. verifyAdminPassword creates AdminSecurity row when missing and env password is correct — PASS
35. verifyAdminPassword re-syncs stale AdminSecurity hash when env password matches — PASS
36. verifyAdminPassword returns configuration_error when ADMIN_PASSWORD is missing even if DB hash exists — PASS
37. seedAdminConfigForFreshInstall upserts owner and keeps bootstrap idempotent — PASS
38. hasAdminPasswordConfigured is false when ADMIN_PASSWORD is missing — PASS
39. createAdminSession stores only token hash — PASS
40. getAuthorizedAdminSession rejects expired session — PASS
41. getAuthorizedAdminSession rejects revoked session — PASS
42. getAuthorizedAdminSession returns active session and updates activity timestamp — PASS
43. isAdminTelegramId: OWNER_TELEGRAM_ID is always admin regardless of DB — PASS
44. isAdminTelegramId: returns false for invalid/empty telegramId — PASS
45. isAdminTelegramId: returns true for ID found in administrator table — PASS
46. isAdminTelegramId: returns false for unknown ID when admins exist in DB — PASS
47. isAdminTelegramId: normalizes numeric and bigint telegram ID input — PASS
48. verifyAdminPassword succeeds for owner when env password matches DB hash — PASS
49. verifyAdminPassword rejects a password not matching ADMIN_PASSWORD even if DB hash would match — PASS
50. createAdminSession token is not stored in plain text — PASS
51. createAdminSession produces a token with sufficient entropy (length > 30) — PASS
52. getAuthorizedAdminSession returns null for missing/undefined token — PASS
53. getAuthorizedAdminSession returns null for empty string token — PASS
54. getRuntimeConfigSummary marks OWNER_TELEGRAM_ID invalid when non-numeric — PASS
55. assertProductionRuntimeConfig fails for missing required env vars — PASS
56. assertProductionRuntimeConfig fails when production demo mode is enabled — PASS
57. assertProductionRuntimeConfig succeeds with valid production config — PASS
58. getAllowedCorsOrigins keeps production origins explicit and never adds localhost — PASS
59. getAllowedCorsOrigins normalizes trailing slashes and casing — PASS
60. getAllowedCorsOrigins honours CORS_ALLOWED_ORIGINS — PASS
61. getSessionSecret throws in production when missing — PASS
62. getRuntimeConfigStatus reflects missing owner/admin configuration — PASS
63. runtime summary never exposes secret values — PASS
64. assertProductionRuntimeConfig fails when ALLOW_DEMO_MODE is missing in production — PASS
65. getAllowedCorsOrigins excludes localhost in production — PASS
66. getAllowedCorsOrigins includes both FRONTEND_URL and WEB_APP_URL when distinct — PASS
67. assertProductionRuntimeConfig fails when OWNER_TELEGRAM_ID is numeric but invalid format — PASS
68. getAllowedCorsOrigins falls back to the known production frontend origin — PASS
69. ALLOW_DEMO_MODE must be a boolean string — PASS
70. demo mode is never enabled in production — PASS
71. FRONTEND_URL that is not an absolute http(s) URL is INVALID — PASS
72. startHttpServer binds before database-dependent initialization completes — PASS
73. runBackgroundInitialization retries after a database failure and keeps the process alive — PASS

### Result by executed frontend test

`npm run test --workspace frontend` -> **PASS**

1. normalizeApiBaseUrl strips trailing slashes so paths never double up — PASS
2. production build uses VITE_API_URL verbatim — PASS
3. production build fails loudly when VITE_API_URL is missing — PASS
4. production build refuses a localhost API URL (no silent fallback) — PASS
5. production build refuses a relative API URL — PASS
6. production build requires HTTPS and the /api path — PASS
7. development falls back to the Vite proxy path — PASS
8. production bundle bakes in VITE_API_URL and contains no localhost API fallback — PASS

### Other requested checks

- Unit tests — PASS
- Integration/API/CORS tests — PASS
- Frontend tests — PASS
- Typecheck — PASS
- Production build — PASS
- Lint — **NOT RUN** (no lint script available)

## 15. Build / Typecheck / Lint

- `npm run db:generate` — PASS
- `npm test` — PASS
  - backend: 73/73 passing
  - frontend: 8/8 passing
- `npm run typecheck` — PASS
  - frontend typecheck passed
  - backend typecheck passed
  - bot typecheck passed
- `npm run build` — PASS
  - frontend build passed (`vite build`)
  - backend build passed (`tsc -p tsconfig.json`)
  - bot build passed (`tsc -p tsconfig.json`)
- `npm run lint` — NOT RUN (script does not exist)

## 16. Live Production Verification

LIVE VERIFICATION BLOCKED

Reason: direct live checks from this environment could not resolve the Render hostnames.

Attempted checks:

- `https://telegram-shop-3781.onrender.com`
- `https://narcos-shop.onrender.com`
- `https://narcos-shop.onrender.com/health`
- `https://narcos-shop.onrender.com/api/health`
- `https://narcos-shop.onrender.com/ready`
- `https://narcos-shop.onrender.com/api/ready`
- `OPTIONS https://narcos-shop.onrender.com/api/session/bootstrap` with origin `https://telegram-shop-3781.onrender.com`

Observed result for all live requests:

- `curl: (6) Could not resolve host: telegram-shop-3781.onrender.com`
- `curl: (6) Could not resolve host: narcos-shop.onrender.com`

Because of that, I could not truthfully mark production reachability, live CORS headers, or deployed-commit identity as verified.

## 17. Render Deployment Status

- Branch: `copilot/complete-production-audit-repair-verification`
- Fixed code commit SHA: `83b1fcac9005c2ec0de6635b86dcc9c997e20710`
- Whether Render is configured to deploy this branch: **not verifiable from repository contents alone**
- Whether deployment was verified: **no**
- Whether deployed commit matches the fixed commit: **not verified**

Notes:

- `render.yaml` defines the expected services and commands.
- Existing Render services may still be configured through the Render dashboard.
- A GitHub commit existing on this branch does **not** prove Render is running it.

## 18. Remaining Problems

1. Live production reachability could not be verified from this environment.
2. Render dashboard/runtime values for the already-existing services are not provable from the repository alone.
3. The actual deployed commit on Render is not verified.
4. Telegram BotFather/web-app button configuration is not verifiable from this environment.

## 19. Exact Manual Actions Required

1. Open Render and find the backend service **Narcos-shop**.
2. Confirm its **Health Check Path** is `/health`.
3. Confirm backend environment variables are set to:
   - `FRONTEND_URL=https://telegram-shop-3781.onrender.com`
   - `WEB_APP_URL=https://telegram-shop-3781.onrender.com`
   - `ALLOW_DEMO_MODE=false`
4. Confirm the backend still has all required secret/runtime values set (`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `BOT_TOKEN_ENCRYPTION_KEY`, `OWNER_TELEGRAM_ID`, and bot token or stored bot config).
5. Confirm the backend deploy uses the updated repository commit from this branch/PR after merge.
6. Open Render and find the frontend service **Telegram-shop**.
7. Confirm frontend environment variable `VITE_API_URL` is exactly `https://narcos-shop.onrender.com/api`.
8. Trigger a fresh frontend rebuild if the env value was changed.
9. In BotFather or the Telegram bot settings, confirm the Mini App / Web App button URL is exactly `https://telegram-shop-3781.onrender.com`.
10. After deployment, open `https://narcos-shop.onrender.com/health` in a browser or with curl.
11. Confirm it returns HTTP 200 JSON.
12. Run an OPTIONS request to `https://narcos-shop.onrender.com/api/session/bootstrap` from the frontend origin and confirm the response includes `Access-Control-Allow-Origin: https://telegram-shop-3781.onrender.com` and `Access-Control-Allow-Credentials: true`.
13. Open the Telegram bot and launch the Mini App.
14. Confirm the shop opens without the connection/network error.
15. Sign in as the owner/admin Telegram account and confirm `/admin` access still works.

## 20. Exact Final Verification Procedure

1. Wait for the backend and frontend Render deployments to finish.
2. Open `https://narcos-shop.onrender.com/health`.
3. Confirm it returns JSON with `status: "ok"`.
4. Open `https://narcos-shop.onrender.com/api/health`.
5. Confirm it also returns JSON with `status: "ok"`.
6. Send an OPTIONS preflight request to `https://narcos-shop.onrender.com/api/session/bootstrap` with origin `https://telegram-shop-3781.onrender.com`.
7. Confirm the response is `204`.
8. Confirm `Access-Control-Allow-Origin` equals `https://telegram-shop-3781.onrender.com`.
9. Confirm `Access-Control-Allow-Credentials` equals `true`.
10. Open the Telegram bot in Telegram.
11. Tap the Web App / Shop button.
12. Confirm the Mini App loads the frontend from `https://telegram-shop-3781.onrender.com`.
13. Confirm the app successfully bootstraps the session instead of showing a network/connection error.
14. Confirm catalog/cities/categories data loads.
15. Confirm an authenticated user can fetch cart/orders/profile endpoints.
16. Confirm admin login still works for the owner/admin Telegram account.
17. Confirm no stale `localhost` or obsolete production URL appears in the browser network traffic.

## 21. Security Audit

Checked areas:

- **Secrets:** no secrets were added to committed files reviewed in this task.
- **Authentication bypasses:** none introduced; Telegram auth remains required in production.
- **Unsafe CORS:** none introduced; no wildcard origin with credentials.
- **Demo mode:** still disabled in production.
- **Telegram auth:** retained and verified in code/tests.
- **Sensitive logging:** current diagnostics avoid logging `initData`, session tokens, admin tokens, or plaintext bot tokens.

Additional notes:

- Active code/config search found no runtime use of `https://78j.onrender.com`.
- `localhost`/`127.0.0.1` references remain only where appropriate for local dev/tests/examples.
- Bot token storage remains encrypted in database via AES-256-GCM using `BOT_TOKEN_ENCRYPTION_KEY`-derived material.

## 22. Final Status

BLOCKED — LIVE VERIFICATION REQUIRED
