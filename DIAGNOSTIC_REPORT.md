# NARCOS SHOP — PRODUCTION DIAGNOSTIC REPORT

Date: 2026-08-24
Repository branch: `copilot/complete-production-audit-repair-verification`
Local verification commit: `61389ccbf0ef8a4ed674072fd3c5f6e59afb0dc9`

Final production readiness status: **BLOCKED — LIVE VERIFICATION REQUIRED**

## 1. Current production architecture

```text
Telegram Mini App / Browser
        |
        v
https://telegram-shop-3781.onrender.com
        |
        v
https://narcos-shop.onrender.com/api
        |
        v
Backend / PostgreSQL / Telegram bot
```

- Frontend build-time API source: `VITE_API_URL`
- Expected frontend origin: `https://telegram-shop-3781.onrender.com`
- Expected backend origin: `https://narcos-shop.onrender.com`
- Expected backend API base: `https://narcos-shop.onrender.com/api`

## 2. Root cause(s)

1. The observed Mini App error is consistent with cross-origin request failure before the browser receives an HTTP response.
2. The repository already had CORS hardening, but production still depends on Render dashboard values actually matching:
   - `FRONTEND_URL=https://telegram-shop-3781.onrender.com`
   - `WEB_APP_URL=https://telegram-shop-3781.onrender.com`
   - frontend `VITE_API_URL=https://narcos-shop.onrender.com/api`
3. Previous reports in the repo were stale and still referenced `https://78j.onrender.com`, which is no longer the intended frontend.
4. Live deployed verification is blocked in this environment because DNS resolution for both Render hosts fails here, so the currently deployed instance could not be confirmed.
5. Frontend diagnostics were too coarse for production debugging and did not distinguish a likely CORS block from a general network failure clearly enough.
6. The backend had liveness endpoints but no readiness endpoint for checking API + database readiness separately.

## 3. Files changed

- `backend/src/app.ts`
- `backend/src/app.smoke.test.ts`
- `frontend/src/api/client.ts`
- `frontend/src/lib/apiConfig.ts`
- `frontend/src/locales/ru.json`
- `frontend/src/locales/en.json`
- `frontend/tests/apiConfig.test.ts`
- `DIAGNOSTIC_REPORT.md`

## 4. Exact fixes

### Backend

- Added `GET /ready`
- Added `GET /api/ready`
- Readiness endpoints return JSON and report database readiness without exposing secrets
- Kept `GET /health` and `GET /api/health` public and lightweight

Example readiness response:

```json
{
  "status": "ok",
  "service": "telegram-shop-backend",
  "timestamp": "2026-08-24T00:00:00.000Z",
  "dependencies": {
    "database": "ok"
  }
}
```

### Frontend

- Tightened production API URL validation:
  - must be absolute
  - must not be localhost
  - must use `https:`
  - must point to `/api`
- Changed likely browser-blocked cross-origin failures from generic `cors_or_network_error` to explicit `cors_blocked`
- Kept timeout and offline/network handling separate
- Added user-facing translations for the new CORS-specific error

### Tests

- Added readiness smoke coverage
- Added frontend production API URL checks for:
  - HTTPS requirement
  - `/api` path requirement

## 5. Environment variables required

### PUBLIC / non-secret configuration

| Variable | Required? | Purpose | Used by | Safe to commit? |
|---|---|---|---|---|
| `VITE_API_URL` | Yes | Frontend build-time API base | Frontend static site | Yes |
| `FRONTEND_URL` | Yes | Backend CORS allowlist + frontend public URL | Backend | Yes |
| `WEB_APP_URL` | Yes | Telegram Web App launch URL | Backend / bot | Yes |
| `CORS_ALLOWED_ORIGINS` | Optional | Extra allowed preview origins | Backend | Yes |
| `ALLOW_DEMO_MODE` | Yes | Must be `false` in production | Backend | Yes |
| `OWNER_TELEGRAM_ID` | Yes | Shop owner admin bootstrap | Backend | Yes |

### SECRET / dashboard-only configuration

| Variable | Required? | Purpose | Used by | Safe to commit? |
|---|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | Backend / Prisma | No |
| `SESSION_SECRET` | Yes | HMAC session signing | Backend | No |
| `ADMIN_PASSWORD` | Yes | Admin login source of truth | Backend | No |
| `BOT_TOKEN_ENCRYPTION_KEY` | Yes | Encrypt stored bot token | Backend | No |
| `TELEGRAM_BOT_TOKEN` | Usually yes | Telegram initData validation and bot runtime | Backend / bot | No |
| `ADMIN_TELEGRAM_IDS` | Optional | Extra admin allowlist | Backend | No |

Important:

- In `render.yaml`, several values use `sync: false`
- Those values must exist in the Render dashboard
- Changing them may require a manual redeploy before the running service picks them up

## 6. Render configuration required

### Backend service (`Narcos-shop`)

- Runtime: Node web service
- Health check path: `/health`
- Must listen on `0.0.0.0` and `process.env.PORT`
- Expected public env:
  - `FRONTEND_URL=https://telegram-shop-3781.onrender.com`
  - `WEB_APP_URL=https://telegram-shop-3781.onrender.com`
  - `ALLOW_DEMO_MODE=false`
- Expected secret env set in dashboard:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `ADMIN_PASSWORD`
  - `BOT_TOKEN_ENCRYPTION_KEY`
  - `TELEGRAM_BOT_TOKEN` if Telegram auth/bot is expected to work

### Frontend service (`Telegram-shop`)

- Runtime: static site
- Build output: `frontend/dist`
- SPA rewrite: `/* -> /index.html`
- Expected build-time env:
  - `VITE_API_URL=https://narcos-shop.onrender.com/api`

## 7. API route inventory summary

Public:

- `GET /health`
- `GET /healthz`
- `GET /api/health`
- `GET /ready`
- `GET /api/ready`
- `GET /api/cities`
- `GET /api/categories`
- `GET /api/catalog`
- `GET /api/products`
- `GET /api/products/:productId`
- `GET /api/products/recommended/list`

Telegram bootstrap:

- `POST /api/session/bootstrap`

User-authenticated:

- `/api/cart`
- `/api/orders`
- `/api/users`
- `/api/balance`
- `/api/casino`
- `/api/support`
- `/api/reviews`
- `/api/wishlist`
- `/api/delivery`
- `/api/discounts/validate`

Admin:

- `/api/admin/auth/*`
- `/api/admin/settings/*`
- `/api/admin/orders/*`
- `/api/admin/products/*`
- `/api/admin/product-cities/*`
- `/api/admin/users`
- `/api/admin/discounts/*`
- `/api/admin/delivery-options/*`
- `/api/admin/support/*`
- `/api/admin/audit-logs`
- `/api/admin/stats`
- `/api/admin/bot/*`
- `/api/admin/cities/*`
- `/api/admin/categories/*`

## 8. Tests executed

Executed locally:

- `npm install`
- `npm run db:generate --workspace backend`
- `npm run test --workspace backend`
- `npm run typecheck --workspace backend`
- `npm run build --workspace backend`
- `npm run test --workspace frontend`
- `npm run typecheck --workspace frontend`
- `npm run build --workspace frontend`

Live verification attempts executed from this environment:

- `curl -i https://narcos-shop.onrender.com/health`
- `curl -i https://narcos-shop.onrender.com/api/health`
- `curl -i https://telegram-shop-3781.onrender.com`

## 9. Test results

| Check | Result |
|---|---|
| Backend tests | PASS — 68/68 |
| Backend typecheck | PASS |
| Backend build | PASS |
| Frontend tests | PASS — 8/8 |
| Frontend typecheck | PASS |
| Frontend build | PASS |
| Backend startup smoke | PASS |
| `GET /health` smoke | PASS |
| `GET /api/health` smoke | PASS |
| `GET /ready` smoke | PASS |
| CORS preflight test for allowed production origin | PASS |
| Disallowed origin CORS test | PASS |
| Production API base URL validation | PASS |
| Telegram forged initData rejection test | PASS |

Notes:

- No lint script was present in the repository package scripts, so no lint command could be executed.
- Backend tests required Prisma client generation first.

## 10. Live verification results

**BLOCKED**

Attempted:

- `https://telegram-shop-3781.onrender.com`
- `https://narcos-shop.onrender.com`
- `https://narcos-shop.onrender.com/health`
- `https://narcos-shop.onrender.com/api/health`

Observed result from this environment:

- `curl: (6) Could not resolve host: telegram-shop-3781.onrender.com`
- `curl: (6) Could not resolve host: narcos-shop.onrender.com`

This means live production verification could not be completed here.

## 11. Exact manual commands for final verification

```bash
# Backend liveness
curl -i \
  https://narcos-shop.onrender.com/health

# Backend API liveness
curl -i \
  https://narcos-shop.onrender.com/api/health

# Backend readiness
curl -i \
  https://narcos-shop.onrender.com/ready

# CORS GET from real frontend origin
curl -i \
  -H "Origin: https://telegram-shop-3781.onrender.com" \
  https://narcos-shop.onrender.com/api/health

# CORS preflight from real frontend origin
curl -i -X OPTIONS \
  -H "Origin: https://telegram-shop-3781.onrender.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization, X-Admin-Token" \
  https://narcos-shop.onrender.com/api/session/bootstrap

# Disallowed origin must be rejected
curl -i \
  -H "Origin: https://evil.example.com" \
  https://narcos-shop.onrender.com/api/health

# Frontend reachability
curl -i \
  https://telegram-shop-3781.onrender.com
```

Expected for allowed-origin requests:

- `Access-Control-Allow-Origin: https://telegram-shop-3781.onrender.com`
- `Access-Control-Allow-Credentials: true`
- `Vary: Origin`

Expected for disallowed-origin request:

- HTTP `403`
- JSON body with `cors_origin_not_allowed`
- no `Access-Control-Allow-Origin` header

## 12. Deployment commit

Local branch under test:

- Branch: `copilot/complete-production-audit-repair-verification`
- Commit: `61389ccbf0ef8a4ed674072fd3c5f6e59afb0dc9`

Deployed Render commit:

- **Unknown from this environment**
- The backend logs `RENDER_GIT_COMMIT` at startup if Render provides it
- Render dashboard branch / auto-deploy status could not be inspected from the repository alone

Deployment requirement:

1. Ensure this commit is merged to the branch Render deploys
2. Ensure both Render services have the expected environment variables
3. Trigger a redeploy/rebuild after confirming dashboard configuration
4. Compare deployed startup logs and health responses after deploy

## 13. Remaining risks

- The actual live Render deployment may still be on an older commit
- `sync: false` dashboard values may still be stale or missing
- Telegram BotFather / Web App settings were not verifiable here
- Live DNS / TLS / browser behavior on Render could not be verified from this environment
- If `TELEGRAM_BOT_TOKEN` is missing in production, Telegram bootstrap will reject signed auth with `503 telegram_bot_token_required`

## 14. Final production readiness status

**BLOCKED — LIVE VERIFICATION REQUIRED**

Reason:

- Repository-level fixes and local validation passed
- Live deployed Render services could not be verified from this environment
- Deployed commit and dashboard configuration still need direct confirmation after redeploy
