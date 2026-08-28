# Telegram Shop — Production Deployment Report

> All statements in this report are derived exclusively from code verified in this repository.
> Where something cannot be confirmed from code alone, it is explicitly noted.

---

## 1. Architecture

This is an **npm monorepo** with three workspaces and one shared database.

| Piece | Type | Render service type |
|---|---|---|
| `frontend/` | React + Vite SPA (static files) | Static site |
| `backend/` | Express REST API | Web service (Node) |
| `bot/` | Telegraf bot | Worker (Node) |
| PostgreSQL | Relational DB (Prisma) | Database |

The entry file for each workspace:
- **Frontend** → `frontend/src/main.tsx`, routed via `HashRouter` (`/#/...`)
- **Backend** → `backend/src/index.ts`, starts Express on `process.env.PORT ?? 3001`
- **Bot** → `bot/src/index.ts`, starts Telegraf polling if `TELEGRAM_BOT_TOKEN` is set

---

## 2. How the parts connect (verified from code)

### Step 1 — Bot sends the Web App button
**Source:** `bot/src/index.ts:28-35`

On `/start`, the bot replies with an inline keyboard button of type `webApp` pointing to `process.env.WEB_APP_URL`. Telegram opens that URL inside its built-in WebView. The bot does **not** call the backend API — it only communicates with Telegram.

### Step 2 — Frontend reads Telegram context
**Source:** `frontend/src/lib/telegram.ts:29-46`

When opened inside Telegram, `window.Telegram.WebApp` is injected. The frontend reads `initData` (a signed query string from Telegram) and the user object from `initDataUnsafe`. Outside Telegram (`window.Telegram` is undefined), in non-production builds, a hardcoded demo user is used instead.

### Step 3 — Frontend authenticates against backend
**Source:** `frontend/src/context/AppContext.tsx:134-177`

On mount, `AppContext` calls `POST /api/session/bootstrap` with `{ initData }`.

### Step 4 — Backend verifies initData and returns a session token
**Source:** `backend/src/routes/session.ts:18-79`, `backend/src/lib.ts:117-163`

The backend verifies the Telegram HMAC signature against `TELEGRAM_BOT_TOKEN` (and any tokens stored in the `telegram_bots` DB table). On success it upserts the user in PostgreSQL and returns a custom HMAC token (`telegramId.hmac`). This token is stored in memory on the frontend and sent as `Authorization: ****** on all subsequent requests.

### Step 5 — Session token authorizes all further API calls
**Source:** `backend/src/lib.ts:296-314`

`getAuthorizedUser()` verifies the HMAC token on every authenticated route using `SESSION_SECRET`.

### Connection diagram

```
Telegram app (user)
  │  /start
  ▼
Bot worker  ──── sends webApp button URL ──►  Telegram app opens WebView
                                                  │
                                                  │  window.Telegram.WebApp.initData
                                                  ▼
                                            Frontend (static site)
                                                  │
                                                  │  POST /api/session/bootstrap { initData }
                                                  ▼
                                            Backend (web service)
                                                  │
                                                  │  Prisma ORM
                                                  ▼
                                            PostgreSQL database
```

---

## 3. Render deployment — what `render.yaml` configures

**Source:** `render.yaml`

The file defines all four services correctly. What each service does:

**`telegram-shop-backend` (web service)**
- `buildCommand`: `npm install --include=dev && npm run build --workspace backend`
- `preDeployCommand`: `npm run db:generate --workspace backend && npm run db:migrate:deploy --workspace backend`
  - This runs Prisma migrations automatically on every deploy. ✔
- `startCommand`: `npm run start --workspace backend` → `node dist/index.js`
- `healthCheckPath`: `/health` (verified: the `/health` endpoint returns `200` in `backend/src/index.ts:107-113`)

**`telegram-shop-frontend` (static site)**
- `buildCommand`: `npm install && npm run build --workspace frontend`
- `staticPublishPath`: `frontend/dist`
- Rewrites all paths to `/index.html` for HashRouter compatibility. ✔
- Reads `VITE_API_URL` at **build time** — this is baked into the JS bundle.

**`telegram-shop-bot` (worker)**
- No port, no health check — correct for a background worker.
- If `TELEGRAM_BOT_TOKEN` is absent, the process stays alive with a `setInterval` loop (by design, no crash). ✔

**`telegram-shop-db` (PostgreSQL free tier)**
- `connectionString` is auto-injected as `DATABASE_URL` in the backend. ✔

---

## 4. Exact configuration required

### 4a. Secrets — must be entered manually in Render dashboard

These are marked `sync: false` in `render.yaml` — Render will never fill them automatically.

| Service | Variable | Required | Notes |
|---|---|---|---|
| `telegram-shop-backend` | `SESSION_SECRET` | **Yes** | Any long random string. Empty → sessions work but with hardcoded dev fallback |
| `telegram-shop-backend` | `TELEGRAM_BOT_TOKEN` | **Yes** | From BotFather. Without this, `POST /api/session/bootstrap` returns `503` and no user can log in |
| `telegram-shop-backend` | `ADMIN_PASSWORD` | Yes | Password for the admin panel at `/#/admin` |
| `telegram-shop-bot` | `TELEGRAM_BOT_TOKEN` | **Yes** | Must be the **same token** as the backend |

### 4b. URLs — hardcoded in `render.yaml`, must match actual Render URLs

**Source:** `render.yaml:29-35,45,65`

```yaml
# Backend env vars (must match the actual frontend URL on Render)
FRONTEND_URL:        https://telegram-shop-378j.onrender.com
WEB_APP_URL:         https://telegram-shop-378j.onrender.com
CORS_ALLOWED_ORIGINS: https://telegram-shop-378j.onrender.com

# Frontend build env var (must match the actual backend URL on Render)
VITE_API_URL:        https://telegram-shop-backend.onrender.com/api

# Bot worker env var
WEB_APP_URL:         https://telegram-shop-378j.onrender.com
```

**Critical:** Render auto-assigns random subdomains for static sites (e.g. `telegram-shop-abc123.onrender.com`). If `telegram-shop-378j` is not the actual assigned slug, the CORS check in `backend/src/index.ts:81-87` will return `403 cors_origin_not_allowed` on every request, and the bot will point to a dead URL.

**How to verify:** In the Render dashboard → `telegram-shop-frontend` → Settings → URL. If it differs from `https://telegram-shop-378j.onrender.com`, update `render.yaml` with the correct URL and redeploy.

> `VITE_API_URL` is a **build-time** variable for Vite. If it is set incorrectly, you must redeploy the static site (not just the backend) to fix API calls.

### 4c. BotFather configuration

The bot is fully functional with just its token. No additional BotFather steps are required for the `/start` → Web App button to work.

**Optional:** To add a persistent Menu button in the chat:
1. In Telegram, message `@BotFather`
2. `/setmenubutton` → select your bot → enter the frontend URL

**Requirement:** The `WEB_APP_URL` **must use `https://`**. Telegram rejects plain HTTP Web App URLs.

---

## 5. Database

### Migrations (automatic)
**Source:** `render.yaml:13`, `backend/package.json:15`

`preDeployCommand` runs `prisma migrate deploy` before every Render deploy. All schema changes are applied automatically. Migrations exist in `backend/prisma/migrations/`.

### Seeding (manual — required for first deploy)
**Source:** `backend/prisma/seed.ts:1-13`

The seed script **deletes all existing data first** (cities, categories, products, users, cart items), then inserts sample data: 3 cities (Варшава, Краков, Вроцлав), 4 categories, and several sample products.

Without seeding, the database has the correct schema but zero rows. The app will load successfully but show no cities to select and no products.

**Run once after first deploy:**
```bash
# From your local machine with production DATABASE_URL
DATABASE_URL="postgresql://..." npm run db:seed --workspace backend
```

Alternatively use the Render shell on the backend service.

> **Warning:** Re-running the seed script on a live database will delete all orders, users, and cart data. It is only safe on a fresh database.

---

## 6. What is currently preventing production from working

Listed in order of severity:

### Blocker 1 — `TELEGRAM_BOT_TOKEN` not set on backend
**Source:** `backend/src/routes/session.ts:26-29`

```ts
if (botTokens.length === 0) {
  sendError(response, 503, 'telegram_bot_token_required', ...)
  return
}
```

If `TELEGRAM_BOT_TOKEN` is not entered in the Render dashboard for the backend service, every bootstrap call returns `503`. The frontend spinner never stops. The app is completely non-functional.

### Blocker 2 — Frontend URL mismatch breaks CORS
**Source:** `backend/src/index.ts:81-87`

```ts
if (!allowedOrigins.has(origin)) {
  response.status(403).json({ code: 'cors_origin_not_allowed', ... })
  return
}
```

If the actual Render static site URL differs from the `https://telegram-shop-378j.onrender.com` value hardcoded in `render.yaml`, every API request from the frontend is rejected with `403`.

### Blocker 3 — Empty database after first deploy
**Source:** `backend/prisma/seed.ts`

Migrations create tables but insert no rows. No cities → the city selection screen is empty. No products → the shop is empty. Must seed manually.

### Non-blocker — Free tier cold starts
**Cannot be verified from code — infrastructure behavior.**

Render free web services sleep after 15 minutes of inactivity. First request after sleep takes 30–60 seconds. The frontend shows a loading spinner during this time. Not a bug — expected free tier behavior.

### Non-blocker — Production demo mode intentionally disabled
**Source:** `frontend/src/lib/telegram.ts:32`

```ts
const allowDemoMode = (import.meta as { env?: ... }).env?.PROD !== true
```

In a production Vite build, `import.meta.env.PROD === true`, so `allowDemoMode` is `false`. Opening the frontend URL directly in a browser (not via Telegram) returns `401` from the backend because `initData` is empty and `ALLOW_DEMO_MODE=false` in production. This is intentional — the app is designed to be opened through Telegram only.

---

## 7. Simplest verified path to a working production deployment

1. **Deploy to Render** using the `render.yaml` in the repository root (Render will auto-detect it).

2. **Find the actual URLs** assigned by Render:
   - Backend service URL (e.g. `https://telegram-shop-backend.onrender.com`)
   - Frontend static site URL (e.g. `https://telegram-shop-378j.onrender.com`)

3. **If the frontend URL is not `https://telegram-shop-378j.onrender.com`**, update `render.yaml`:
   - Replace all five occurrences of `https://telegram-shop-378j.onrender.com` with the actual URL
   - Commit and push to trigger a redeploy

4. **Set secrets in Render dashboard** for `telegram-shop-backend`:
   - `SESSION_SECRET` = any 64-character random hex string
   - `TELEGRAM_BOT_TOKEN` = your bot token from BotFather
   - `ADMIN_PASSWORD` = a strong password

5. **Set secrets in Render dashboard** for `telegram-shop-bot`:
   - `TELEGRAM_BOT_TOKEN` = **same token** as above

6. **Seed the database** (one time only):
   ```bash
   DATABASE_URL="<connection string from Render DB dashboard>" npm run db:seed --workspace backend
   ```

7. **Verify in Telegram**: send `/start` to your bot → tap the "Открыть Telegram Shop" button → the Web App should open and authenticate.

8. **Access the admin panel**: open `https://<frontend-url>/#/admin` in a browser and enter the `ADMIN_PASSWORD` to add real products, cities, and categories.

---

## 8. Structure verdict

The current project structure is correct for this deployment target. No fundamental changes are needed:

- HashRouter is appropriate for a Render static site with `/* → /index.html` rewrites.
- Custom HMAC session tokens (not cookies) are correct for a cross-origin SPA calling a separate API domain.
- Telegram initData verification matches the [official Telegram algorithm](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) (`HMAC-SHA256` with `WebAppData` key).
- The bot as a separate worker is architecturally sound.
- `preDeployCommand` for migrations is the correct Render pattern.

The only structural concern is cosmetic: the root `postinstall` script runs `npm run build --workspace backend` when `$RENDER=true`, but `buildCommand` also runs the same build. This causes a double build on Render. It is harmless but wasteful.
