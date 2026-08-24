# FINAL PRODUCTION AUDIT — Telegram Shop Mini App

**Date:** 2026-08-24
**Branch:** `copilot/final-production-repair`
**Reported symptom:** the Mini App renders
`Проблема с соединением. Проверьте сеть и попробуйте снова.`
**Verdict:** root cause identified and fixed in code. Remote verification is **BLOCKED** —
the audit environment has no outbound DNS (see Phase 8).

Production topology treated as authoritative throughout this audit:

| Component | URL |
| --- | --- |
| Backend | `https://narcos-shop.onrender.com` |
| Backend API base | `https://narcos-shop.onrender.com/api` |
| Frontend | `https://telegram-shop-3781.onrender.com` |
| `VITE_API_URL` | `https://narcos-shop.onrender.com/api` |
| `FRONTEND_URL` / `WEB_APP_URL` | `https://telegram-shop-3781.onrender.com` |
| `ALLOW_DEMO_MODE` | `false` |

---

## Executive summary — root cause

The error string is produced by the frontend, not the backend. It is the translation of the
API client's `network_error` code, which is raised whenever `fetch()` rejects *before a
response is received*. The browser raises exactly that rejection when a cross-origin request
is blocked by CORS.

The backend built its CORS allowlist exclusively from `FRONTEND_URL` and `WEB_APP_URL`, and
`render.yaml` still declared both as **`https://78j.onrender.com`** — a URL that is no longer
the frontend. The real frontend origin `https://telegram-shop-3781.onrender.com` was therefore
absent from the allowlist, and every browser request from the Mini App was refused before the
application code ever ran.

Three secondary defects made the failure permanent and undiagnosable:

1. A rejected origin was reported by `callback(new Error(...))`, which Express turned into a
   500 HTML error page carrying **no** CORS headers — so even the failure was opaque.
2. Origin matching was an exact string comparison, so a trailing slash or a capitalized host
   in the dashboard value would silently break the allowlist again.
3. The frontend collapsed *every* pre-response failure — CORS, offline, DNS, timeout — into a
   single `network_error`, and it had no `/health` endpoint or diagnostic surface to isolate
   the layer at fault.

---

## Phase 1 — Repository exploration

| Item | Result |
| --- | --- |
| Monorepo layout (`frontend`, `backend`, `bot`, `database`, `admin`) mapped | PASS |
| `render.yaml` reviewed | PASS |
| All `package.json` files reviewed | PASS |
| `backend/src/**` reviewed (entry point, routes, services) | PASS |
| `frontend/src/**` reviewed (API client, context, Telegram bridge, i18n) | PASS |
| `bot/src/**` reviewed | PASS |
| Searched `VITE_API_URL`, CORS config, `/api/session/bootstrap`, `Telegram.WebApp`, `Проблема с соединением`, localhost fallbacks | PASS |
| Request flow frontend → backend traced end to end | PASS |

Traced flow:

```
main.tsx → App → AppProvider(useEffect)
  → getTelegramContext()            frontend/src/lib/telegram.ts   (WebApp.ready(), initData)
  → bootstrapSession(initData)      frontend/src/context/AppContext.tsx
  → api.bootstrap({ initData })     frontend/src/api/client.ts
  → fetch(`${VITE_API_URL}/session/bootstrap`, { credentials: 'include' })
  ── browser CORS preflight (OPTIONS) ──────────────────────────────────────
  → Express app                     backend/src/index.ts
  → cors() middleware               ← allowlist from FRONTEND_URL / WEB_APP_URL
  → express.json()
  → /api/session router             backend/src/routes/session.ts
  → authRateLimiter → POST /bootstrap → verifyTelegramInitData()
```

Failure point: the CORS middleware, before any application logic.

## Phase 2 — Root cause identification

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | `render.yaml` declared `FRONTEND_URL`/`WEB_APP_URL` as the stale `https://78j.onrender.com`; the live frontend origin was never in the CORS allowlist | P0 | FIXED |
| 2 | Origin comparison was exact string equality — a trailing slash or different casing breaks it | P0 | FIXED |
| 3 | Rejected origins threw into Express' default error handler → 500 HTML without CORS headers | P0 | FIXED |
| 4 | No hardcoded safety net for the known production frontend origin, so a stale dashboard value alone can take the app down | P0 | FIXED |
| 5 | `/health` did not exist (only `/` and `/api/health` returning `{status:"ok"}` with no service name) | P1 | FIXED |
| 6 | No `Vary: Origin` — a CDN could replay one origin's CORS headers to another | P1 | FIXED |
| 7 | Frontend `throw` at module scope when `VITE_API_URL` was missing → blank screen, not a diagnostic | P1 | FIXED |
| 8 | `VITE_API_URL` was used verbatim; a trailing slash produced `/api//session/bootstrap` → 404 | P1 | FIXED |
| 9 | Every pre-response failure mapped to a single `network_error`; CORS, offline and timeout were indistinguishable | P1 | FIXED |
| 10 | Dead `frontend/src/lib/api.ts` hardcoded a relative `/api` base that would resolve against the **static site**, not the backend | P2 | FIXED (deleted) |
| 11 | `ALLOW_DEMO_MODE` was compared as a raw string; a typo such as `False` was accepted as "not false" | P2 | FIXED |
| 12 | `/api/session/bootstrap` fell back to demo mode whenever `NODE_ENV !== 'production'`, and coerced any `initData` value with `String()` | P2 | FIXED |
| 13 | `getWebAppUrl()` could hand a `localhost` URL to real Telegram users | P2 | FIXED |
| 14 | Unknown `/api/*` paths returned Express' HTML 404 | P2 | FIXED |
| 15 | Backend "session/auth blocking OPTIONS" | — | NOT_APPLICABLE — no global auth middleware existed; auth is per-router. CORS is nonetheless now guaranteed to terminate OPTIONS first. |

## Phase 3 — Code fixes

### 3a. CORS middleware — PASS

New file `backend/src/middleware/cors.ts`, replacing the `cors` npm package (dependency
removed).

| Requirement | Status | Implementation |
| --- | --- | --- |
| Origin normalization (strip trailing slash, lowercase scheme + host) | PASS | `normalizeOrigin()` parses with `URL`, returns `protocol//host`, dropping path, trailing slash, default port and casing |
| Supports `https://telegram-shop-3781.onrender.com` | PASS | From `FRONTEND_URL`/`WEB_APP_URL` **and** as a hardcoded production safety net |
| Supports `WEB_APP_URL` | PASS | `getAllowedCorsOrigins()` |
| Never wildcard with credentials | PASS | The exact request origin is echoed; `*` is never emitted. Asserted by test |
| OPTIONS passes before auth | PASS | CORS is `app.use()`d first and answers preflight with `204`; body parser, routers, rate limiters and auth all run after |
| `Vary: Origin` | PASS | `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers` on every response |
| Disallowed origin handling | PASS | JSON `403 cors_origin_not_allowed`, no `Access-Control-Allow-Origin`, logged server-side |
| No-Origin requests (curl, health probes, Telegram) | PASS | Passed through untouched, with no CORS headers |

### 3b. Frontend API client — PASS

`frontend/src/lib/apiConfig.ts` (new) + `frontend/src/api/client.ts`.

| Requirement | Status | Implementation |
| --- | --- | --- |
| No silent localhost fallback in production | PASS | `resolveApiBaseUrl()` rejects `localhost`/`127.0.0.1`/`0.0.0.0`/`[::1]` and relative bases when `import.meta.env.PROD` |
| Fail loudly if `VITE_API_URL` missing in production | PASS | `console.error` at startup, `ApiError('api_not_configured')` on every request, and the reason is rendered in the UI. Deliberately not a module-scope `throw`, which would abort the bundle and show a blank screen |
| Safe diagnostic logging (no secrets/initData/tokens) | PASS | `getApiDiagnostics()` exposes only base URL, mode, page origin and an in-Telegram flag. Request logs contain URL, method and error code only — never headers, bodies, `initData` or tokens |
| Differentiate CORS / network / 401 / 403 / 500 / 503 | PASS | `classifyFetchFailure()` → `request_timeout` (abort), `network_error` (`navigator.onLine === false`), `cors_or_network_error` (cross-origin target). Status codes map to `unauthorized`, `forbidden`, `not_found`, `too_many_requests`, `server_error`, `server_unreachable`, `service_unavailable` |
| Trailing slash normalization | PASS | `normalizeApiBaseUrl()` |
| Request timeout | PASS | 20 s `AbortController` |

### 3c. Backend middleware order — PASS

`backend/src/index.ts` was split into `backend/src/app.ts` (`createApp()`, no side effects,
importable by tests) and `backend/src/index.ts` (startup/listen). The documented, enforced
order is:

1. CORS — terminates OPTIONS
2. Public health endpoints — `/health`, `/healthz`, `/api/health`, `/` (no auth, no DB)
3. `express.json({ limit: '1mb' })`
4. API routers (each owns its own auth)
5. JSON `404` for `/api/*`, then a JSON error handler

`x-powered-by` disabled; `trust proxy` enabled so the rate limiter sees real client IPs behind
Render's proxy.

### 3d. Runtime config validation — PASS

`backend/src/services/runtimeConfig.ts`:

- `ALLOW_DEMO_MODE` parsed strictly as `true`/`false`; anything else is `INVALID`.
- `isDemoModeEnabled()` returns `false` unconditionally when `NODE_ENV=production`.
- `FRONTEND_URL` / `WEB_APP_URL` must be absolute `http(s)` URLs, else `INVALID`.
- Startup aborts (`process.exit(1)`) on missing/invalid required config, and now also when the
  resolved CORS allowlist is empty.
- `getWebAppUrl()` never returns `localhost` in production.
- Optional `CORS_ALLOWED_ORIGINS` (comma-separated) for deploy previews.
- Demo mode was **not** enabled anywhere: `ALLOW_DEMO_MODE` stays `"false"` in `render.yaml`.

### 3e. Telegram WebApp initialization — PASS

`frontend/src/lib/telegram.ts`:

- `WebApp.ready()` is called first, before `expand()` and the theme colours, and before the
  viewport metrics are read (previously the viewport was measured before `ready()`).
- `initData` is read after initialization and forwarded unchanged as
  `POST /api/session/bootstrap { initData }`.
- Added `hasEmptyInitData` so "the SDK is present but sent no signed data" is distinguishable
  from "not running inside Telegram".
- Guarded against `window` being undefined.
- Outside Telegram the app now shows a **diagnostic panel** (API base URL, page origin,
  in-Telegram flag, error code/status, config error) instead of a misleading connection error.

## Phase 4 — Health endpoints

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /health` → `{ status: "ok", service: "telegram-shop-backend", timestamp }` | PASS | Public, no auth, no database |
| `GET /api/health` → same payload | PASS | Public, no auth |
| `GET /healthz` → same payload | PASS | Extra alias for platform probes |
| Registered before all routers / auth | PASS | Verified by `app.smoke.test.ts` |

## Phase 5 — Automated tests

`npm test` (root) → `backend` then `frontend`.

| Suite | File | Status |
| --- | --- | --- |
| CORS: allowed origin gets credentialed headers | `backend/src/middleware/cors.test.ts` | PASS |
| CORS: disallowed origin → 403, no `Access-Control-Allow-Origin` | same | PASS |
| CORS: OPTIONS preflight for `/api/session/bootstrap` → 204 before auth | same | PASS |
| CORS: trailing-slash / casing normalization | same | PASS |
| CORS: never `*` with credentials | same | PASS |
| CORS: no-Origin requests are never blocked | same | PASS |
| Smoke: `GET /health` and `GET /api/health` | `backend/src/app.smoke.test.ts` | PASS |
| Smoke: `OPTIONS /api/session/bootstrap` preflight | same | PASS |
| Smoke: `POST /api/session/bootstrap` with no / forged / non-string `initData` → 400/401/403 | same | PASS |
| Smoke: unknown `/api/*` returns JSON 404 | same | PASS |
| Smoke: unlisted origin cannot reach bootstrap | same | PASS |
| Config: `ALLOW_DEMO_MODE` boolean validation, demo never on in production, URL validation, allowlist normalization, `CORS_ALLOWED_ORIGINS` | `backend/src/services/runtimeConfig.test.ts` | PASS |
| Frontend: `VITE_API_URL` used verbatim; missing/localhost/relative rejected in production | `frontend/tests/apiConfig.test.ts` | PASS |
| Frontend: real production build contains `VITE_API_URL` and **no** localhost API endpoint | `frontend/tests/build.test.ts` | PASS |

Results:

```
backend : # tests 67  # pass 67  # fail 0
frontend: # tests 7   # pass 7   # fail 0
npm run typecheck : clean (frontend, backend, bot)
npm run build     : succeeds (frontend, backend, bot)
```

## Phase 6 — `PRODUCTION_TODO.md`

| Item | Status |
| --- | --- |
| P0/P1/P2/P3 prioritized checklist created | PASS |
| Includes operator actions that cannot be done from the repo (Render dashboard env vars) | PASS |
| Includes verification commands | PASS |

## Phase 7 — `render.yaml`

| Item | Before | After | Status |
| --- | --- | --- | --- |
| `FRONTEND_URL` | `https://78j.onrender.com` | `https://telegram-shop-3781.onrender.com` | FIXED |
| `WEB_APP_URL` | `https://78j.onrender.com` | `https://telegram-shop-3781.onrender.com` | FIXED |
| `VITE_API_URL` | `https://narcos-shop.onrender.com/api` | unchanged (already correct) | PASS |
| `ALLOW_DEMO_MODE` | `"false"` | unchanged | PASS |
| `healthCheckPath` | absent | `/health` | ADDED |
| `CORS_ALLOWED_ORIGINS` | absent | declared, `sync: false` | ADDED |

> `render.yaml` is a blueprint. Render does **not** re-apply it to a service that was created
> or edited manually, so the same values must be set in the dashboard — see P0 in
> `PRODUCTION_TODO.md`.

## Phase 8 — Live HTTP verification

**Status: BLOCKED — no outbound DNS in the audit environment. Nothing below was faked.**

| Check | Command | Result |
| --- | --- | --- |
| Backend health | `curl https://narcos-shop.onrender.com/health` | BLOCKED — `curl: (6) Could not resolve host: narcos-shop.onrender.com` |
| Backend API health | `curl https://narcos-shop.onrender.com/api/health` | BLOCKED — same DNS failure |
| CORS preflight | `curl -X OPTIONS https://narcos-shop.onrender.com/api/session/bootstrap -H "Origin: https://telegram-shop-3781.onrender.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type" -v` | BLOCKED — same DNS failure |
| Frontend reachable | `curl https://telegram-shop-3781.onrender.com` | BLOCKED — `curl: (6) Could not resolve host: telegram-shop-3781.onrender.com` |
| General internet | `curl https://api.github.com` | BLOCKED — `Blocked by DNS monitoring proxy` |

Compensating control: the same checks run against a real in-process HTTP server in
`backend/src/app.smoke.test.ts` and `backend/src/middleware/cors.test.ts` (real `listen()`,
real `fetch()`, real headers). Re-run the live commands after deployment — they are listed at
the bottom of `PRODUCTION_TODO.md`.

## Phase 9 — Git workflow

| Item | Status |
| --- | --- |
| Branch `copilot/final-production-repair` created | PASS |
| All changes committed | PASS |
| Pushed via `report_progress` | PASS |
| Non-draft PR opened against `main` | PASS |
| PR **not** merged | PASS (by instruction) |

## Constraint compliance

| Constraint | Status |
| --- | --- |
| No secrets exposed or printed | PASS — only `CONFIGURED`/`MISSING`/`INVALID` statuses are logged; frontend diagnostics never include `initData` or tokens |
| Production database not reset | PASS — no schema, migration or seed changes |
| Demo mode not enabled | PASS — `ALLOW_DEMO_MODE` stays `"false"`; demo is now hard-disabled in production code |
| No wildcard CORS with credentials | PASS — asserted by test |
| PR not merged | PASS |
| Not mixed with the NARCOS CITY project | PASS — no cross-project references |
| No unproven URLs such as `78j.onrender.com` | PASS — the stale value was removed, not reintroduced |

## Changed files

```
backend/src/app.ts                          (new) createApp(), documented middleware order
backend/src/index.ts                        startup only; fail-fast on empty CORS allowlist
backend/src/middleware/cors.ts              (new) strict credential-safe CORS
backend/src/middleware/cors.test.ts         (new) CORS test suite
backend/src/app.smoke.test.ts               (new) HTTP smoke tests
backend/src/routes/session.ts               strict initData validation, no implicit demo mode
backend/src/services/runtimeConfig.ts       origin normalization, boolean + URL validation
backend/src/services/runtimeConfig.test.ts  updated/extended
backend/package.json                        removed the `cors` / `@types/cors` dependency
frontend/src/lib/apiConfig.ts               (new) API base resolution + validation
frontend/src/api/client.ts                  diagnostics, error classification, timeout
frontend/src/lib/telegram.ts                ready() ordering, hasEmptyInitData
frontend/src/context/AppContext.tsx         connection diagnostics state
frontend/src/components/Layout/Layout.tsx   diagnostic panel instead of a fake error
frontend/src/components/Layout/Layout.module.css
frontend/src/locales/{ru,en}.json           new error + diagnostics strings
frontend/src/lib/api.ts                     (deleted) dead relative-/api client
frontend/tests/apiConfig.test.ts            (new)
frontend/tests/build.test.ts                (new)
frontend/tsconfig.test.json                 (new)
frontend/package.json                       test script
package.json                                root test script
render.yaml                                 corrected URLs, healthCheckPath
.env.example                                documented CORS_ALLOWED_ORIGINS + prod values
PRODUCTION_TODO.md                          (new)
FINAL_PRODUCTION_AUDIT.md                   (new)
```

---

**STATUS: PASS (code) / BLOCKED (live remote verification)**
