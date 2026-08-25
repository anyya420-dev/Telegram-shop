# Telegram Shop 🛍

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/anyya420-dev/Telegram-shop)

Telegram Web App магазин с каталогом по городам, гибкими правилами количества, рабочей корзиной и русско-английской локализацией интерфейса.

## Стек

| Часть | Технология |
|-------|-----------|
| Frontend | React + Vite + TypeScript |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Bot | Telegraf |

## Структура проекта

```text
/frontend    — React Web App
/backend     — REST API + Prisma schema/seed
/bot         — Telegram Bot
/admin       — административная часть (будет позже)
```

## Установка

```bash
npm install
```

## Подготовка базы данных

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

## Запуск

```bash
npm run dev:backend
npm run dev:frontend
npm run dev:bot
```

## Проверка

```bash
npm run verify
npm run typecheck
npm run build
```

## Environment variables

Скопируйте `.env.example` в `.env` и заполните значения локально.

### Render: backend service (`telegram-shop-backend`)

Обязательные backend-переменные:

- `NODE_ENV` (`production`)
- `DATABASE_URL`
- `SESSION_SECRET`
- `OWNER_TELEGRAM_ID`
- `ADMIN_PASSWORD`
- `BOT_TOKEN_ENCRYPTION_KEY`
- `FRONTEND_URL`
- `WEB_APP_URL`
- `ALLOW_DEMO_MODE` (`false` в production)

Дополнительно:

- `PORT`
- `TELEGRAM_BOT_TOKEN` (обязателен для первой production-настройки, либо активный токен должен уже храниться в БД через Admin UI)
- `ADMIN_TELEGRAM_IDS`
- `PORT`

`ADMIN_PASSWORD`, `OWNER_TELEGRAM_ID`, `DATABASE_URL`, `BOT_TOKEN_ENCRYPTION_KEY` используются **только backend runtime** и не должны попадать во frontend.

Для production owner-доступа установите:

- `OWNER_TELEGRAM_ID=8405501187`

### Render: frontend service (`telegram-shop-frontend`)

- `VITE_API_URL` (production: `https://narcos-shop.onrender.com/api`)

Во frontend запрещено передавать backend-секреты (`ADMIN_PASSWORD`, `BOT_TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`).

Backend выполняет production startup validation и аварийно завершает запуск при отсутствии обязательных переменных или при неверной конфигурации (`OWNER_TELEGRAM_ID` invalid, `ALLOW_DEMO_MODE` не `false`).

⚠️ Никогда не коммитьте реальные секреты в репозиторий.

## Admin authentication contract

- Frontend first bootstraps user session via `POST /api/session/bootstrap` with Telegram `initData`.
- Backend verifies Telegram signature server-side and creates `sessionToken`.
- Frontend sends the Authorization header with the ****** token on admin auth requests.
- Admin login request: `POST /api/admin/auth/login` with body `{ "password": "..." }`.
- Backend identifies Telegram ID only from authenticated session token (not from request body).
- On success backend returns `adminToken`; frontend must send it in `X-Admin-Token` for protected `/api/admin/*` routes.
- `ADMIN_PASSWORD` is backend source of truth. If missing, runtime diagnostics must show `ADMIN_PASSWORD: MISSING` and admin login returns configuration error.

## Production verification checklist (Render + Telegram)

### Verified from repository

- `render.yaml` запускает backend как Node web service (`npm run start --workspace backend`) и frontend как static service.
- Prisma production migrations должны выполняться на Render через `preDeployCommand`, чтобы backend успевал привязаться к `PORT` и отдавать `/health` даже при временных проблемах с БД.
- Backend слушает `PORT` и `0.0.0.0` в `backend/src/index.ts`.
- Production runtime validation блокирует запуск при отсутствующих обязательных переменных и при `ALLOW_DEMO_MODE != false`.
- Telegram Mini App identity проверяется на backend через `initData` подпись и только затем создаётся `sessionToken`.

### Must be verified in Render/Telegram dashboard

- В Render backend env реально заданы: `DATABASE_URL`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN` (или активный токен в БД), `ADMIN_PASSWORD`, `BOT_TOKEN_ENCRYPTION_KEY`, `FRONTEND_URL`, `WEB_APP_URL`, `ALLOW_DEMO_MODE=false`, `OWNER_TELEGRAM_ID=8405501187`.
- В Render frontend env `VITE_API_URL` указывает на production backend `/api`.
- В BotFather/menu button веб-приложение бота направлено на production `WEB_APP_URL`.
- После деплоя owner (`8405501187`) проходит bootstrap в Telegram Mini App, открывает `/admin`, вводит только admin password и получает доступ в панель.

## Production smoke test

```bash
npm run smoke:production
```

Скрипт проверяет production frontend/backend, health/readiness endpoints, CORS preflight для `/api/session/bootstrap`, и ищет stale API URLs (`localhost`, `127.0.0.1`, `78j.onrender.com`) в production frontend assets.
