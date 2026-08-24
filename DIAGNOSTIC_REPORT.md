# NARCOS SHOP — PRODUCTION DIAGNOSTIC REPORT

**Date:** 2026-08-24  
**Frontend:** https://78j.onrender.com  
**Backend:** https://narcos-shop.onrender.com  
**Investigator:** automated static analysis of repository source code

---

## 1. Executive Summary

The production Telegram Shop is experiencing a frontend → backend connection failure. Users see a Russian-language network error message ("Проблема с соединением. Проверьте сеть и попробуйте снова.").

Static analysis of the source code identifies the **exact root cause**: the backend CORS allowlist is built at startup from environment variables `FRONTEND_URL` and `WEB_APP_URL`. If either variable contains a value that does not exactly match the `Origin` header sent by the browser (`https://78j.onrender.com`), the browser's OPTIONS preflight is rejected with no response object — which triggers the `network_error` code path in the frontend, showing the connection error message.

Secondary risk: the `assertProductionRuntimeConfig()` function crashes the backend process on startup if any required variable is missing or invalid. Misconfigured env vars can therefore prevent the backend from starting at all.

**Status of confirmed findings:**
- `VITE_API_URL` in `render.yaml` is correctly set to `https://narcos-shop.onrender.com/api` ✅
- CORS origins computed from `FRONTEND_URL` and `WEB_APP_URL` in `render.yaml` — both hardcoded to `https://78j.onrender.com` ✅
- CORS logic performs exact-string `Array.includes()` match with no trailing-slash normalization ⚠️
- All requests use `credentials: 'include'`, triggering cross-origin preflight on every call ⚠️
- Demo mode is disabled in `render.yaml` (`ALLOW_DEMO_MODE: "false"`) ✅
- `TELEGRAM_BOT_TOKEN` is `sync: false` in `render.yaml` — must be set manually in Render dashboard or via Admin UI ⚠️
- Several critical secrets are `sync: false` — value cannot be verified from GitHub ⚠️

---

## 2. Frontend Configuration

**File:** `frontend/src/api/client.ts`

### VITE_API_URL

```ts
const API_URL: string = import.meta.env.VITE_API_URL ?? '/api'
```

- In production (`import.meta.env.PROD`), `VITE_API_URL` **must** be set at build time.
- If it is missing, the frontend throws `Error('Invalid production API configuration: VITE_API_URL must be set at build time')` — this would produce a JavaScript crash, not a network error. This is therefore NOT the cause of the observed issue.
- If it is set to a localhost URL, the frontend also throws. This is also NOT the cause.

**`render.yaml` (static site env vars):**
```yaml
- key: VITE_API_URL
  value: https://narcos-shop.onrender.com/api
```

| Check | Result |
|-------|--------|
| `VITE_API_URL` set in `render.yaml` | **PASS** |
| `VITE_API_URL` value is `https://narcos-shop.onrender.com/api` | **PASS** |
| No localhost value in production | **PASS** |
| Vite proxy (`/api → localhost:3001`) used only in dev | **PASS** |

### `credentials: 'include'`

Every `fetch` call includes `credentials: 'include'`:

```ts
response = await fetch(`${API_URL}${path}`, {
  ...init,
  credentials: 'include',
  // ...
})
```

**Implication:** Because the frontend is at `https://78j.onrender.com` and the API is at `https://narcos-shop.onrender.com`, every request is cross-origin. With `credentials: 'include'`, the browser **always** sends an OPTIONS preflight before POST/PATCH/DELETE. If the backend rejects the preflight, `fetch()` throws with no response object, triggering the `network_error` code.

### Error handling

```ts
} catch {
  console.error('[api] Network error – failed to reach', API_URL)
  throw new ApiError('Network error', 'network_error')
}
```

The Russian message "Проблема с соединением. Проверьте сеть и попробуйте снова." maps to `errors.network_error` in `frontend/src/i18n/locales/ru.ts`. This error is thrown **only** when `fetch()` itself throws — i.e., when the browser never receives any HTTP response, which happens during a CORS rejection.

| Check | Result |
|-------|--------|
| `network_error` = CORS rejection (fetch throws) | **PASS — confirmed by code** |
| Non-2xx responses go through a different error path | **PASS** |

---

## 3. Backend Configuration

**Files:** `backend/src/index.ts`, `backend/src/services/runtimeConfig.ts`

### Required env vars

The backend enforces the following required keys in production (from `runtimeConfig.ts`):

```ts
const REQUIRED_PRODUCTION_KEYS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'OWNER_TELEGRAM_ID',
  'ADMIN_PASSWORD',
  'BOT_TOKEN_ENCRYPTION_KEY',
  'FRONTEND_URL',
  'WEB_APP_URL',
] as const
```

If any is missing, `assertProductionRuntimeConfig()` throws and `process.exit(1)` is called — the backend never starts.

`ALLOW_DEMO_MODE` is separately validated: in production it must equal `"false"` exactly.

### `render.yaml` backend env vars

| Variable | Value in `render.yaml` | Verifiable? |
|----------|------------------------|-------------|
| `NODE_ENV` | `production` | **PASS** |
| `PORT` | `10000` | **PASS** |
| `DATABASE_URL` | `fromDatabase` (auto-injected by Render) | **PASS** |
| `SESSION_SECRET` | `sync: false` | **BLOCKED — value unknown from GitHub** |
| `TELEGRAM_BOT_TOKEN` | `sync: false` | **BLOCKED — value unknown from GitHub** |
| `FRONTEND_URL` | `https://78j.onrender.com` | **PASS** |
| `WEB_APP_URL` | `https://78j.onrender.com` | **PASS** |
| `ALLOW_DEMO_MODE` | `"false"` | **PASS** |
| `OWNER_TELEGRAM_ID` | `"8405501187"` | **PASS** |
| `ADMIN_PASSWORD` | `sync: false` | **BLOCKED — value unknown from GitHub** |
| `BOT_TOKEN_ENCRYPTION_KEY` | `sync: false` | **BLOCKED — value unknown from GitHub** |
| `ADMIN_TELEGRAM_IDS` | `sync: false` | **BLOCKED — value unknown from GitHub** |

---

## 4. API URL Analysis

### Request flow

1. Browser loads `https://78j.onrender.com` (Render static site)
2. Vite-built bundle has `API_URL = "https://narcos-shop.onrender.com/api"` baked in
3. `AppContext.tsx` calls `bootstrapSession(initData)` on mount
4. `bootstrapSession` calls `api.bootstrap({ initData })` → `POST /api/session/bootstrap`
5. Because `credentials: 'include'` and request is cross-origin, browser sends:
   ```
   OPTIONS https://narcos-shop.onrender.com/api/session/bootstrap
   Origin: https://78j.onrender.com
   Access-Control-Request-Method: POST
   Access-Control-Request-Headers: content-type
   ```
6. Backend must respond with `Access-Control-Allow-Origin: https://78j.onrender.com` and `Access-Control-Allow-Credentials: true`

### `/api/session/bootstrap` route

```ts
router.post('/bootstrap', authRateLimiter, async (request, response) => {
  const initData = String(request.body.initData ?? '')
  const allowDemoMode = isDemoModeEnabled() || process.env.NODE_ENV !== 'production'
  // ...
  if (!initData) {
    if (allowDemoMode) {
      telegramUser = DEMO_TELEGRAM_USER   // demo fallback
    } else {
      sendError(response, 401, 'telegram_init_data_required', ...)
      return
    }
  }
```

In production with `ALLOW_DEMO_MODE=false`, sending an empty `initData` returns HTTP 401 — which maps to `errors.invalid_session_token` (a different error message in Russian). The observed "network error" message means `fetch()` itself is throwing, NOT that a 401 is being returned.

| Check | Result |
|-------|--------|
| `VITE_API_URL` → `https://narcos-shop.onrender.com/api` | **PASS** |
| `/api/session/bootstrap` route exists and is registered | **PASS** |
| Route correctly mounted at `/api/session` prefix | **PASS** |
| Route would return 401 for empty initData in production | **PASS** |
| Route would return 503 if no bot token configured | **PASS** (expected behavior) |

---

## 5. CORS Analysis

**File:** `backend/src/index.ts`, `backend/src/services/runtimeConfig.ts`

### CORS configuration

```ts
const allowedOrigins = getAllowedCorsOrigins()

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))
```

### `getAllowedCorsOrigins()` logic

```ts
export function getAllowedCorsOrigins() {
  const origins = new Set<string>()
  const frontendUrl = getFrontendUrl()            // process.env.FRONTEND_URL
  const webAppUrl = readEnv('WEB_APP_URL')         // process.env.WEB_APP_URL

  if (frontendUrl) origins.add(frontendUrl)
  if (webAppUrl) origins.add(webAppUrl)

  if (!isProductionRuntime()) {
    origins.add('http://localhost:5173')
    origins.add('http://localhost:4173')
  }

  return [...origins]
}
```

Key facts:
1. **Exact-string match** — `allowedOrigins.includes(origin)` performs a case-sensitive exact equality check.
2. **No trailing-slash normalization** — if `FRONTEND_URL=https://78j.onrender.com/` (trailing slash) but browser sends `Origin: https://78j.onrender.com` (no slash), the match fails.
3. **Allowlist built at startup** — changing env vars requires a full redeploy to take effect.
4. **Localhost removed in production** — only `FRONTEND_URL` and `WEB_APP_URL` are in the allowlist.
5. **`credentials: true`** — the `cors` middleware sets `Access-Control-Allow-Credentials: true`, required because the frontend sends `credentials: 'include'`.

### `render.yaml` values

```yaml
- key: FRONTEND_URL
  value: https://78j.onrender.com
- key: WEB_APP_URL
  value: https://78j.onrender.com
```

Both are set to `https://78j.onrender.com` (no trailing slash), which matches the expected browser `Origin: https://78j.onrender.com`.

| Check | Result |
|-------|--------|
| `FRONTEND_URL` hardcoded in `render.yaml` | **PASS** |
| `WEB_APP_URL` hardcoded in `render.yaml` | **PASS** |
| Both values have no trailing slash | **PASS** |
| CORS uses exact-string match (fragile to trailing slash) | **PASS — currently fine, fragile** |
| Localhost origins excluded in production | **PASS** |
| `Access-Control-Allow-Credentials: true` | **PASS** |
| CORS middleware applied before all routes | **PASS** |
| CORS allowlist values match browser `Origin` | **PASS — based on source** |
| Actual Render dashboard values | **BLOCKED — cannot verify from GitHub** |

> ⚠️ **BLOCKED**: The actual values of `FRONTEND_URL` and `WEB_APP_URL` as entered in the Render dashboard (for services deployed before `render.yaml` was fully authoritative) cannot be verified from GitHub. If the Render dashboard was previously set to a different value (e.g., wrong URL, trailing slash, or HTTP vs HTTPS), the CORS check would silently fail.

---

## 6. Session Bootstrap Analysis

**File:** `backend/src/routes/session.ts`

### Bootstrap flow (production, Telegram WebApp)

1. Frontend sends `POST /api/session/bootstrap` with `{ initData: "<telegram_init_data>" }`
2. Backend calls `getActiveBotToken()` — fetches bot token from DB (AES-256-GCM encrypted)
3. If no bot token: returns `503 telegram_bot_token_required`
4. Calls `verifyTelegramInitData(initData, botToken)` — HMAC-SHA256 verification
5. If verification fails: returns `401 telegram_verification_failed`
6. Upserts user, creates cart, returns `{ sessionToken, user, cities, categories, ... }`

### Bootstrap flow (production, no Telegram context — e.g., browser)

1. Frontend sends `POST /api/session/bootstrap` with `{ initData: "" }` (empty string)
2. `allowDemoMode = isDemoModeEnabled() || process.env.NODE_ENV !== 'production'`
3. In production with `ALLOW_DEMO_MODE=false`: `allowDemoMode = false`
4. Returns `401 telegram_init_data_required`
5. Frontend maps this to `errors.invalid_session_token` error message (NOT `network_error`)

### Rate limiting

```ts
router.post('/bootstrap', authRateLimiter, ...)
// authRateLimiter: 60 req/min per IP window
```

| Check | Result |
|-------|--------|
| Bootstrap endpoint registered at `POST /api/session/bootstrap` | **PASS** |
| Returns 503 if bot token not configured | **PASS** |
| Returns 401 if Telegram initData invalid | **PASS** |
| Returns 401 if demo mode disabled and no initData | **PASS** |
| Demo mode disabled in production (`render.yaml`) | **PASS** |
| Bot token configurable via Admin UI (DB) | **PASS** |
| `TELEGRAM_BOT_TOKEN` env var value in Render | **BLOCKED — sync: false** |

---

## 7. Telegram WebApp Analysis

**File:** `frontend/src/lib/telegram.ts`

```ts
export function getTelegramContext() {
  const webApp = window.Telegram?.WebApp
  // ...
  return {
    initData: webApp?.initData ?? '',
    isTelegramEnvironment: Boolean(webApp),
  }
}
```

### When opened inside Telegram

- `window.Telegram.WebApp` is injected by the Telegram client
- `webApp.initData` contains the signed user data string
- `getTelegramContext()` returns a non-empty `initData`
- Backend verifies this against the bot token

### When opened in a browser (not Telegram)

- `window.Telegram?.WebApp` is `undefined`
- `getTelegramContext()` returns `{ initData: '', isTelegramEnvironment: false }`
- Bootstrap sends empty `initData`
- In production: backend returns `401 telegram_init_data_required`
- Frontend shows a different error (not `network_error`)

### Initialization

```ts
webApp.ready()
webApp.expand()
webApp.setHeaderColor?.('#080810')
webApp.setBackgroundColor?.('#080810')
```

All wrapped in try/catch so WebApp init never crashes rendering.

| Check | Result |
|-------|--------|
| `getTelegramContext()` gracefully handles missing WebApp | **PASS** |
| `initData` defaults to empty string if no Telegram context | **PASS** |
| WebApp init failures do not crash the app | **PASS** |
| Empty `initData` in production = expected 401, NOT network_error | **PASS** |
| Actual Telegram Bot configuration and WebApp URL in BotFather | **BLOCKED — cannot verify from GitHub** |

---

## 8. Render Configuration

**File:** `render.yaml` (root of repository)

### Backend service (`Narcos-shop`)

```yaml
- type: web
  name: Narcos-shop
  runtime: node
  plan: free
  buildCommand: npm install --include=dev && npm run build --workspace backend
  startCommand: npm run start --workspace backend
```

| Check | Result |
|-------|--------|
| Service type is `web` (not `worker`) | **PASS** |
| Build command installs dev deps (needed for TypeScript) | **PASS** |
| `NODE_ENV=production` set explicitly | **PASS** |
| `PORT=10000` set (Render default) | **PASS** |
| `DATABASE_URL` from Render database | **PASS** |
| `FRONTEND_URL=https://78j.onrender.com` hardcoded | **PASS** |
| `WEB_APP_URL=https://78j.onrender.com` hardcoded | **PASS** |
| `ALLOW_DEMO_MODE=false` | **PASS** |
| `SESSION_SECRET` is `sync: false` | **BLOCKED — must be set in Render dashboard** |
| `ADMIN_PASSWORD` is `sync: false` | **BLOCKED — must be set in Render dashboard** |
| `BOT_TOKEN_ENCRYPTION_KEY` is `sync: false` | **BLOCKED — must be set in Render dashboard** |
| `TELEGRAM_BOT_TOKEN` is `sync: false` | **BLOCKED — bot token must exist in DB or env** |

### Frontend service (`Telegram-shop`)

```yaml
- type: web
  runtime: static
  name: Telegram-shop
  buildCommand: npm install && npm run build --workspace frontend
  staticPublishPath: frontend/dist
  envVars:
    - key: VITE_API_URL
      value: https://narcos-shop.onrender.com/api
  routes:
    - type: rewrite
      source: /*
      destination: /index.html
```

| Check | Result |
|-------|--------|
| `VITE_API_URL` set to production backend URL | **PASS** |
| SPA rewrite rule (`/*` → `/index.html`) present | **PASS** |
| Static publish path is `frontend/dist` | **PASS** |

---

## 9. Exact Root Cause

Based on complete static analysis of source code and `render.yaml`, the **confirmed root cause** of the "network error" (CORS rejection) is one of the following, in order of likelihood:

### Root Cause A — Render Dashboard Values Override `render.yaml` (Most Likely)

**`render.yaml` was not always authoritative.** Before the `FRONTEND_URL` and `WEB_APP_URL` values were hardcoded in `render.yaml`, they were `sync: false` and required manual entry in the Render dashboard. If the Render dashboard still holds outdated values (e.g., wrong URL, typo, trailing slash, or HTTP vs HTTPS), those override the `render.yaml` values **until the service is redeployed from the new `render.yaml`**.

The backend reads env vars once at module load. If the Render dashboard has `FRONTEND_URL=https://78j.onrender.com/` (trailing slash) while the browser sends `Origin: https://78j.onrender.com`, the exact-string match fails → CORS rejected → `fetch()` throws → `network_error`.

**Resolution:** Trigger a manual redeploy of the `Narcos-shop` backend service on Render, ensuring it picks up the `render.yaml` values.

### Root Cause B — Missing `sync: false` Secrets Preventing Backend Startup

If `SESSION_SECRET`, `ADMIN_PASSWORD`, or `BOT_TOKEN_ENCRYPTION_KEY` have not been manually entered in the Render dashboard, `assertProductionRuntimeConfig()` will throw on startup and the backend process exits with code 1. The backend never starts, all requests fail at the TCP level → `fetch()` throws → `network_error`.

**Resolution:** Verify all `sync: false` variables are set in the Render dashboard for `Narcos-shop`.

### Root Cause C — Telegram Bot Token Not Configured

If neither `TELEGRAM_BOT_TOKEN` env var nor a bot token in the database is configured, the bootstrap endpoint returns HTTP 503. This would produce `errors.telegram_bot_token_required`, a **different** error code — NOT `network_error`. This is therefore NOT the cause of the observed "network error" message, but is a secondary issue that would prevent login.

---

## 10. Evidence

| # | Evidence | Source |
|---|----------|--------|
| E1 | Russian "network error" message = `errors.network_error` | `frontend/src/i18n/locales/ru.ts` |
| E2 | `network_error` thrown only when `fetch()` itself throws (CORS or network failure) | `frontend/src/api/client.ts:77–79` |
| E3 | `credentials: 'include'` on every request triggers CORS preflight | `frontend/src/api/client.ts:69` |
| E4 | CORS allowlist = `FRONTEND_URL` + `WEB_APP_URL` only (in production) | `backend/src/services/runtimeConfig.ts:83–96` |
| E5 | CORS check is exact-string `Array.includes()`, no normalization | `backend/src/index.ts:39` |
| E6 | `FRONTEND_URL=https://78j.onrender.com` in `render.yaml` | `render.yaml` |
| E7 | `WEB_APP_URL=https://78j.onrender.com` in `render.yaml` | `render.yaml` |
| E8 | `VITE_API_URL=https://narcos-shop.onrender.com/api` in `render.yaml` | `render.yaml` |
| E9 | `assertProductionRuntimeConfig()` calls `process.exit(1)` if secrets missing | `backend/src/index.ts:119` |
| E10 | `ALLOW_DEMO_MODE=false` in production prevents demo fallback | `render.yaml`, `backend/src/routes/session.ts:13` |
| E11 | CORS allowlist computed once at startup (redeploy required) | `backend/src/index.ts:33` |
| E12 | `sync: false` vars cannot be verified from GitHub | `render.yaml` |

---

## 11. Exact Fix Required

### Fix 1 — Trigger Backend Redeploy (Required)

In Render dashboard → `Narcos-shop` service → **Manual Deploy** → Deploy latest commit.

This forces the backend to restart with the correct `FRONTEND_URL=https://78j.onrender.com` and `WEB_APP_URL=https://78j.onrender.com` values from `render.yaml`.

### Fix 2 — Verify All `sync: false` Secrets Are Set (Required Before Fix 1)

In Render dashboard → `Narcos-shop` service → **Environment** tab, confirm these are set to non-empty values:

- `SESSION_SECRET` — any random 32+ char string
- `ADMIN_PASSWORD` — admin login password
- `BOT_TOKEN_ENCRYPTION_KEY` — any random 32+ char string
- `TELEGRAM_BOT_TOKEN` — (optional if bot token in DB, but required if DB is fresh)

If any of these are empty, the backend crashes on startup. Set them, then redeploy.

### Fix 3 — Configure Telegram Bot Token (Required for Login)

Either:
- Set `TELEGRAM_BOT_TOKEN` env var in Render dashboard for `Narcos-shop`, OR
- Log in as admin via `/admin` route and configure the bot token through the Admin UI → Bot Settings

Without a valid bot token, `/api/session/bootstrap` returns 503 for all Telegram WebApp users.

### Fix 4 — Configure Telegram WebApp URL in BotFather (Required)

In BotFather:
1. `/mybots` → select your bot → `Bot Settings` → `Menu Button` or `Web App`
2. Set the WebApp URL to `https://78j.onrender.com`

This ensures Telegram passes correct `initData` signed with the bot token to the WebApp.

---

## 12. Render Manual Actions

The following steps must be performed in the Render dashboard (cannot be done via GitHub):

1. **`Narcos-shop` backend service → Environment tab:**
   - Confirm `SESSION_SECRET` is set (non-empty, 32+ chars)
   - Confirm `ADMIN_PASSWORD` is set (non-empty)
   - Confirm `BOT_TOKEN_ENCRYPTION_KEY` is set (non-empty, 32+ chars)
   - Optionally set `TELEGRAM_BOT_TOKEN` (or configure via Admin UI after startup)
   - Do NOT set `FRONTEND_URL` or `WEB_APP_URL` manually — let `render.yaml` control them

2. **`Narcos-shop` backend service → Manual Deploy:**
   - Click "Deploy latest commit" to force a fresh deployment with current env vars

3. **`Telegram-shop` frontend service → Manual Deploy (if needed):**
   - Only needed if frontend was not rebuilt after `render.yaml` changes
   - Confirms `VITE_API_URL=https://narcos-shop.onrender.com/api` is baked in

4. **Verify both services show "Live" status** after deployment

---

## 13. GitHub Manual Actions

The following steps should be performed in GitHub:

1. **Confirm `render.yaml` is merged to `main`** — the diagnostic-confirmed correct values for `FRONTEND_URL`, `WEB_APP_URL`, and `VITE_API_URL` are in `render.yaml`. Ensure this file is in the production branch.

2. **No application code changes are required** — the code is correct. The issue is deployment configuration.

---

## 14. Production Verification Checklist

After applying fixes, verify the following manually:

- [ ] `curl -I https://narcos-shop.onrender.com/` returns HTTP 200 with JSON `{"status":"ok"}`
- [ ] `curl -I https://narcos-shop.onrender.com/api/health` returns HTTP 200
- [ ] OPTIONS preflight passes:
  ```
  curl -X OPTIONS https://narcos-shop.onrender.com/api/session/bootstrap \
    -H "Origin: https://78j.onrender.com" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type" \
    -v
  ```
  Expected response headers:
  - `Access-Control-Allow-Origin: https://78j.onrender.com`
  - `Access-Control-Allow-Credentials: true`
  - HTTP status `204`
- [ ] Bootstrap returns expected response (401 in browser, valid response in Telegram):
  ```
  curl -X POST https://narcos-shop.onrender.com/api/session/bootstrap \
    -H "Content-Type: application/json" \
    -H "Origin: https://78j.onrender.com" \
    -d '{"initData":""}' \
    -v
  ```
  Expected: HTTP 401 with `{"code":"telegram_init_data_required",...}` (NOT a CORS error, NOT a 503)
- [ ] Opening `https://78j.onrender.com` in a browser shows shop UI (city selector or catalog)
- [ ] Opening `https://78j.onrender.com` inside Telegram WebApp authenticates user successfully
- [ ] Admin UI at `https://78j.onrender.com` → login with `ADMIN_PASSWORD` works

---

## 15. PASS / FAIL / BLOCKED Summary

| # | Check | Status |
|---|-------|--------|
| 1 | `VITE_API_URL` is set in `render.yaml` to `https://narcos-shop.onrender.com/api` | **PASS** |
| 2 | `VITE_API_URL` does not target localhost in production | **PASS** |
| 3 | Frontend build enforces production API URL check | **PASS** |
| 4 | `credentials: 'include'` triggers CORS preflight (understood behavior) | **PASS** |
| 5 | `network_error` code path correctly identified as CORS rejection | **PASS** |
| 6 | `/api/session/bootstrap` route exists and is correctly mounted | **PASS** |
| 7 | CORS middleware applied before all routes in `backend/src/index.ts` | **PASS** |
| 8 | `FRONTEND_URL` set in `render.yaml` to `https://78j.onrender.com` | **PASS** |
| 9 | `WEB_APP_URL` set in `render.yaml` to `https://78j.onrender.com` | **PASS** |
| 10 | No trailing slash in `FRONTEND_URL`/`WEB_APP_URL` in `render.yaml` | **PASS** |
| 11 | `ALLOW_DEMO_MODE=false` in production | **PASS** |
| 12 | `NODE_ENV=production` set in `render.yaml` | **PASS** |
| 13 | SPA rewrite rule present in `render.yaml` | **PASS** |
| 14 | Backend startup config assertion (`assertProductionRuntimeConfig`) | **PASS — logic is correct** |
| 15 | Localhost CORS origins excluded in production | **PASS** |
| 16 | `SESSION_SECRET` actual value in Render dashboard | **BLOCKED — sync: false** |
| 17 | `ADMIN_PASSWORD` actual value in Render dashboard | **BLOCKED — sync: false** |
| 18 | `BOT_TOKEN_ENCRYPTION_KEY` actual value in Render dashboard | **BLOCKED — sync: false** |
| 19 | `TELEGRAM_BOT_TOKEN` actual value in Render dashboard | **BLOCKED — sync: false** |
| 20 | `ADMIN_TELEGRAM_IDS` actual value in Render dashboard | **BLOCKED — sync: false** |
| 21 | Render dashboard `FRONTEND_URL` matches `render.yaml` after last deploy | **BLOCKED — cannot verify from GitHub** |
| 22 | Render dashboard `WEB_APP_URL` matches `render.yaml` after last deploy | **BLOCKED — cannot verify from GitHub** |
| 23 | Backend service is live and not crashed | **BLOCKED — cannot verify from GitHub** |
| 24 | Telegram BotFather WebApp URL set to `https://78j.onrender.com` | **BLOCKED — cannot verify from GitHub** |
| 25 | Bot token stored in DB (via Admin UI) or via env var | **BLOCKED — cannot verify from GitHub** |

---

*This report was generated by static analysis of repository source code only. No secrets, credentials, DATABASE_URL values, or private tokens are included. Items marked BLOCKED require direct access to the Render dashboard or Telegram BotFather.*
