# Telegram Shop

Telegram Web App магазин с минималистичным интерфейсом в чёрном, графитовом и холодном синем цветах.

## Что реализовано в этой части

- основа монорепозитория;
- frontend для Telegram Web App магазина;
- backend API для пользователей, городов, каталога, товаров и корзины;
- SQLite + Prisma schema и seed-данные;
- базовый Telegram bot для открытия Web App;
- placeholder для будущей admin части.

## Стек

- **Frontend:** React 19, Vite, TypeScript, React Router
- **Backend:** Node.js, Express, TypeScript
- **Database:** Prisma + SQLite
- **Bot:** Telegraf

## Структура проекта

```text
/frontend   - Telegram Web App интерфейс магазина
/backend    - API, логика каталога, профиля и корзины
/bot        - Telegram bot с кнопкой открытия магазина
/admin      - placeholder под будущую админку
/database   - Prisma schema и seed-данные
```

## Основные возможности

- интеграция с Telegram Web App SDK;
- демо-режим вне Telegram для локальной разработки;
- выбор города при первом входе;
- каталог с поиском и категориями;
- фильтрация товаров по городу;
- карточка товара с гибким количеством;
- корзина с итогами и рекомендованными товарами;
- базовый профиль с возможностью смены города.

## Environment variables

Скопируйте `.env.example` в `.env` и заполните значения локально.

```env
VITE_API_URL=http://localhost:3001/api
PORT=3001
DATABASE_URL=file:./dev.db
FRONTEND_URL=http://localhost:5173
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
WEB_APP_URL=http://localhost:5173
```

## Установка зависимостей

```bash
npm install
```

## Подготовка базы данных

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

## Локальный запуск

### Backend

```bash
npm run dev:backend
```

Backend стартует на `http://localhost:3001`.

### Frontend

```bash
npm run dev:frontend
```

Frontend стартует на `http://localhost:5173`.

### Bot

```bash
npm run dev:bot
```

Для запуска бота нужен `TELEGRAM_BOT_TOKEN`.

## Сборка

```bash
npm run build
```

## Проверка типов

```bash
npm run typecheck
```

## Seed-данные

### Города

- Варшава
- Краков
- Вроцлав

### Категории

- Одежда
- Электроника
- Дом
- Аксессуары
- Другое

### Товары

- Кофе
- Наушники
- Футболка
- Зарядка

У кофе настроено количество `0.5 → 1 → 1.5 ...` и отдельные записи доступности для Варшавы и Кракова.

## Безопасность

- секреты не добавляются в репозиторий;
- `.env.example` содержит только шаблон;
- клиентские данные Telegram используются только для базовой инициализации;
- серверная проверка `initData` может быть добавлена следующим шагом без перестройки архитектуры.
