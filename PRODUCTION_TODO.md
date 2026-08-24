# PRODUCTION TODO — Telegram Shop Mini App

Prioritized checklist for restoring and hardening the production deployment.

Production topology (authoritative):

| Component | URL |
| --- | --- |
| Backend service | `https://narcos-shop.onrender.com` |
| Backend API base | `https://narcos-shop.onrender.com/api` |
| Frontend static site | `https://telegram-shop-3781.onrender.com` |

Legend: `[x]` done in this branch · `[ ]` still required (mostly dashboard/operator actions).

---

## P0 — Blocking: the Mini App cannot reach the backend

- [x] **Fix the stale CORS allowlist.** `render.yaml` still declared `FRONTEND_URL` /
      `WEB_APP_URL` as `https://78j.onrender.com`. The backend builds its CORS allowlist
      from those variables, so every browser request from
      `https://telegram-shop-3781.onrender.com` was rejected. Both keys now point at the
      real frontend URL.
- [x] **Normalize origins before comparing.** Origins are now compared after lowercasing
      scheme + host and stripping trailing slashes, ports-by-default and paths, so
      `https://Telegram-Shop-3781.onrender.com/` matches the browser `Origin` header.
- [x] **Add a hardcoded production origin safety net.** `https://telegram-shop-3781.onrender.com`
      is always in the allowlist in production, so a stale dashboard value can no longer
      lock the Mini App out of its own backend.
- [x] **Stop throwing from the CORS callback.** A rejected origin used to be handed to the
      Express default error handler, which returned a 500 HTML page with no CORS headers.
      It now returns a JSON `403 cors_origin_not_allowed`.
- [x] **Guarantee OPTIONS passes before auth.** CORS is the very first middleware and
      terminates the preflight itself, before body parsing, rate limiting and every router.
- [ ] **Update the Render dashboard env vars for the `Narcos-shop` service**
      (`render.yaml` is not automatically re-applied to an existing service):
      `FRONTEND_URL=https://telegram-shop-3781.onrender.com`,
      `WEB_APP_URL=https://telegram-shop-3781.onrender.com`, `ALLOW_DEMO_MODE=false`.
- [ ] **Confirm `VITE_API_URL=https://narcos-shop.onrender.com/api`** on the `Telegram-shop`
      static site and trigger a rebuild (Vite bakes the value in at build time).

## P1 — Reliability and diagnosability

- [x] `GET /health` and `GET /api/health` return `{ status, service, timestamp }`, require no
      auth, touch no database, and are registered before every router.
- [x] `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers` on every
      response, so a CDN can never replay one origin's CORS headers to another.
- [x] Never emit `Access-Control-Allow-Origin: *` together with credentials.
- [x] Frontend no longer throws at module scope when `VITE_API_URL` is missing (that produced
      a blank screen). It records the configuration error and surfaces it in the UI.
- [x] Frontend no longer silently falls back to a relative/localhost API base in production.
- [x] `VITE_API_URL` trailing slashes are stripped so requests never become `/api//session/...`.
- [x] Distinct error codes for CORS/network, timeout, 401, 403, 404, 429, 5xx instead of a
      single `network_error`.
- [x] 20 s request timeout via `AbortController`, mapped to `request_timeout`.
- [x] Unknown `/api/*` routes return JSON `404`, never an HTML page.
- [x] Deleted the dead `frontend/src/lib/api.ts`, which hardcoded a relative `/api` base that
      would have hit the static site instead of the backend.
- [ ] Configure Render's health check path to `/health` on the backend service (declared in
      `render.yaml`, must also be verified in the dashboard).

## P2 — Configuration correctness

- [x] `ALLOW_DEMO_MODE` is validated as a boolean string; anything other than `true`/`false`
      is reported as `INVALID` and fails startup in production.
- [x] Demo mode is unconditionally disabled when `NODE_ENV=production`, regardless of the
      env value; `/api/session/bootstrap` no longer accepts demo users in production.
- [x] `FRONTEND_URL` / `WEB_APP_URL` must be absolute `http(s)` URLs, otherwise startup fails.
- [x] The process fails fast when the resolved CORS allowlist is empty.
- [x] `getWebAppUrl()` never returns a `localhost` URL in production.
- [x] Optional `CORS_ALLOWED_ORIGINS` (comma-separated) for deploy previews.
- [x] `/api/session/bootstrap` returns `400 invalid_request_body` for a non-string `initData`
      instead of coercing it.
- [x] `render.yaml` declares `healthCheckPath: /health` and documents the CORS variables.

## P3 — Follow-ups (not blocking)

- [ ] Add a CI workflow running `npm run typecheck` and `npm test` on pull requests.
- [ ] Add a scheduled uptime probe against `https://narcos-shop.onrender.com/health`
      (the free Render plan cold-starts after inactivity, which looks like a timeout).
- [ ] Consider a structured request logger with a request id echoed back to the client.
- [ ] Deduplicate the two unused locale trees (`frontend/src/i18n/locales/*.ts` is dead code;
      `frontend/src/locales/*.json` is the live one).
- [ ] Rotate `SESSION_SECRET` / `ADMIN_PASSWORD` / `BOT_TOKEN_ENCRYPTION_KEY` if they were ever
      committed or shared.

---

## Verification commands

```bash
# 1. Backend is up and public
curl -sS https://narcos-shop.onrender.com/health
# expected: {"status":"ok","service":"telegram-shop-backend","timestamp":"..."}

# 2. Preflight from the real frontend origin
curl -sS -o /dev/null -D - -X OPTIONS \
  https://narcos-shop.onrender.com/api/session/bootstrap \
  -H "Origin: https://telegram-shop-3781.onrender.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
# expected: 204, Access-Control-Allow-Origin: https://telegram-shop-3781.onrender.com,
#           Access-Control-Allow-Credentials: true, Vary: Origin

# 3. A foreign origin must be refused
curl -sS -o /dev/null -D - \
  https://narcos-shop.onrender.com/api/health \
  -H "Origin: https://evil.example.com"
# expected: 403 and NO Access-Control-Allow-Origin header

# 4. Frontend is served
curl -sSI https://telegram-shop-3781.onrender.com

# 5. Local test suites
npm run typecheck && npm test
```
