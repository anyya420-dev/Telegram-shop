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
/admin       — документация по административной части
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
npm run typecheck
npm run build
```

## Environment variables

Скопируйте `.env.example` в `.env` и заполните значения локально.

- `DATABASE_URL` — строка подключения к PostgreSQL базе данных
- `PORT` — порт backend сервера
- `FRONTEND_URL` — origin frontend для CORS
- `ALLOW_DEMO_MODE` — локальный demo-режим вне Telegram
- `SESSION_SECRET` — секрет подписи пользовательской сессии
- `TELEGRAM_BOT_TOKEN` — токен Telegram бота
- `WEB_APP_URL` — публичный URL Web App
- `ADMIN_WEB_APP_URL` — публичный URL admin Web App (например `https://.../#/admin`)

⚠️ Никогда не коммитьте реальные секреты в репозиторий.
