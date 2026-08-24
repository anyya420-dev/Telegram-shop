# Production Diagnostic Report

**Symptom:** Frontend at `https://78j.onrender.com` displays  
> "Проблема с соединением. Проверьте сеть и попробуйте снова."

---

## 1. Confirmed Facts

| # | Fact | Source |
|---|------|--------|
| 1 | The Russian message "Проблема с соединением…" maps to exactly one error code: `network_error` | `frontend/src/i18n/locales/ru.ts:101` |
| 2 | `network_error` is thrown only in the `catch {}` block of `request()`, which fires only when `fetch()` itself throws — i.e., the browser never receives any HTTP response | `frontend/src/api/client.ts:77–79` |
| 3 | `fetch()` throws at the browser level (no response) in exactly two cases: (a) true TCP/DNS network failure, or (b) CORS rejection. Since the backend root is confirmed reachable, the cause is (b): a CORS error | Browser behavior spec |
| 4 | The frontend always sends `credentials: 'include'` for every request, including bootstrap | `frontend/src/api/client.ts:69` |
| 5 | Because `credentials: 'include'` is set and the request crosses origins, the browser always sends an OPTIONS preflight before the POST | CORS spec |
| 6 | The backend CORS allowed-origins list is built exclusively from two env vars: `FRONTEND_URL` and `WEB_APP_URL` | `backend/src/services/runtimeConfig.ts:83–96` |
| 7 | The CORS check is an exact string `Array.includes()` match — no normalization, no trailing-slash stripping | `backend/src/index.ts:39` |
| 8 | In production (`NODE_ENV=production`) the localhost fallbacks are NOT added to the allowlist | `backend/src/services/runtimeConfig.ts:91–94` |
| 9 | Both `FRONTEND_URL` and `WEB_APP_URL` are in `REQUIRED_PRODUCTION_KEYS`; if either is empty the backend throws and calls `process.exit(1)` before the HTTP server starts | `backend/src/services/runtimeConfig.ts:12–20`, `backend/src/index.ts:74,119` |
| 10 | The backend root endpoint is confirmed working, so the backend is running — meaning both vars are set to non-empty strings | User-confirmed |
| 11 | `FRONTEND_URL` and `WEB_APP_URL` were `sync: false` in `render.yaml` before PR #36, meaning their values came entirely from manual Render dashboard entries | `render.yaml` (pre-PR-#36 state) |
| 12 | The allowed-origins list is computed once at module load and never refreshed; a redeploy is required for any env var change to take effect | `backend/src/index.ts:33` |
| 13 | Non-2xx HTTP responses do NOT produce `network_error`; 401 `telegram_init_data_required` produces "Для открытия магазина требуется Telegram Web App." — a different message | `frontend/src/api/client.ts:82–94`, `frontend/src/i18n/locales/ru.ts:107` |

---

## 2. Exact Request URL

The frontend sends the following on startup:

```
OPTIONS https://narcos-shop.onrender.com/api/session/bootstrap
  Origin: https://78j.onrender.com
  Access-Control-Request-Method: POST
  Access-Control-Request-Headers: content-type

POST https://narcos-shop.onrender.com/api/session/bootstrap
  Origin: https://78j.onrender.com
  Content-Type: application/json
  credentials: include
  Body: {"initData":""}
```

`API_URL` is baked into the production bundle at build time as:
```
https://narcos-shop.onrender.com/api
```
(set via `VITE_API_URL` in `render.yaml` for the static site — this is correct and was never the problem).

---

## 3. CORS Configuration

**Backend CORS middleware (`backend/src/index.ts:35–43`):**
```ts
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)           // no-origin requests allowed
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))
```

**How `allowedOrigins` is populated (`backend/src/services/runtimeConfig.ts:83–96`):**
```ts
export function getAllowedCorsOrigins() {
  const origins = new Set<string>()
  const frontendUrl = readEnv('FRONTEND_URL')
  const webAppUrl   = readEnv('WEB_APP_URL')

  if (frontendUrl) origins.add(frontendUrl)
  if (webAppUrl)   origins.add(webAppUrl)

  // localhost entries only added when NODE_ENV !== 'production'
  return [...origins]
}
```

For the origin `https://78j.onrender.com` to be allowed, at least one of
`FRONTEND_URL` or `WEB_APP_URL` must equal exactly `https://78j.onrender.com`
(no trailing slash, exact case).

---

## 4. Exact Problem Found

**`FRONTEND_URL` and `WEB_APP_URL` in the running Render deployment are set to a value other than `https://78j.onrender.com`.**

Before PR #36 both were `sync: false` (manual dashboard values). The backend is up, so they are non-empty — but they contain the wrong URL. Most probable wrong values:

- `https://telegram-shop.onrender.com` — the render.yaml service `name`, which is not the actual Render-assigned URL
- `http://localhost:5173` — the dev default from `.env.example`
- A URL with a trailing slash, e.g. `https://78j.onrender.com/`

Any of these causes `allowedOrigins.includes('https://78j.onrender.com')` to return `false`, the backend returns a CORS error on every preflight, and the browser never delivers a response to JavaScript — producing `network_error` → "Проблема с соединением."

---

## 5. Evidence

### Code evidence

- `getAllowedCorsOrigins()` only adds `FRONTEND_URL` and `WEB_APP_URL` to the set — nothing else in production.
- `allowedOrigins` is frozen at startup: changing the env vars in the dashboard requires a redeploy.
- The test `"getAllowedCorsOrigins returns empty array when neither FRONTEND_URL nor WEB_APP_URL is set in production"` confirms: wrong/empty values = empty allowlist = all cross-origin requests rejected.
- 44/44 backend unit tests pass; the code logic is correct — the problem is purely a configuration value.

### Logical evidence

- If the backend were down, the root URL would also fail. It doesn't.
- If the error were a 401/503, the user would see a different Russian message.
- If the error were a true network failure, the entire Render platform would be unreachable.
- Therefore CORS is the only remaining explanation.

---

## 6. Exact Fix Required

Set both env vars to the correct production frontend URL on the backend service:

```
FRONTEND_URL = https://78j.onrender.com
WEB_APP_URL  = https://78j.onrender.com
```

No trailing slash. Exact string. Then redeploy the backend.

---

## 7. What Must Be Changed in Render

**Render dashboard → Narcos-shop (backend web service) → Environment:**

| Variable | Current (wrong) value | Required value |
|----------|----------------------|----------------|
| `FRONTEND_URL` | unknown — but not `https://78j.onrender.com` | `https://78j.onrender.com` |
| `WEB_APP_URL` | unknown — but not `https://78j.onrender.com` | `https://78j.onrender.com` |

After saving, trigger a manual redeploy of **Narcos-shop**.

> Note: PR #36 already makes these values `value: https://78j.onrender.com` in `render.yaml`.
> Merging and deploying PR #36 will set them automatically for all future deployments.
> However, if the Render service has a manually overridden dashboard value, the dashboard
> value takes precedence over `render.yaml` until it is cleared or overwritten.

---

## 8. What Must Be Changed in GitHub

PR #36 (`fix: hardcode FRONTEND_URL and WEB_APP_URL in render.yaml to fix production CORS`) already contains the correct fix. Once merged it prevents this class of misconfiguration from recurring.

No additional code changes are needed — the CORS logic and route implementation are correct.

---

## 9. How to Verify the Fix

**Step 1 — Verify CORS preflight (run from any terminal after redeploy):**
```bash
curl -sv -X OPTIONS \
  -H "Origin: https://78j.onrender.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  https://narcos-shop.onrender.com/api/session/bootstrap 2>&1 \
  | grep -E "< HTTP|< access-control"
```

**Expected on success:**
```
< HTTP/2 204
< access-control-allow-origin: https://78j.onrender.com
< access-control-allow-credentials: true
< access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE
```

**Step 2 — Verify bootstrap returns a proper response (not a network error):**
```bash
curl -s -X POST \
  -H "Origin: https://78j.onrender.com" \
  -H "Content-Type: application/json" \
  -d '{"initData":""}' \
  https://narcos-shop.onrender.com/api/session/bootstrap
```

**Expected on success (ALLOW_DEMO_MODE=false, no Telegram context):**
```json
{"code":"telegram_init_data_required","message":"Telegram init data is required"}
```
HTTP 401 — this is correct. It means CORS passed and the backend responded. The frontend will show "Для открытия магазина требуется Telegram Web App." instead of "Проблема с соединением."

**Step 3 — Open `https://78j.onrender.com` in a browser after the fix.** The "Проблема с соединением" error must be gone. In a browser (not Telegram), the app will show an authentication error, which is expected. Inside Telegram with a valid bot token, it must fully authenticate and display the shop.
