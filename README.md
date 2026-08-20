# Telegram Shop 🛍

Telegram Web App магазин с минималистичным дизайном в чёрном и холодном синем цветах.

## Стек

| Часть | Технология |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | SQLite (dev) |
| Bot | node-telegram-bot-api |

## Структура проекта

```
/frontend    — React Web App (Telegram WebApp SDK)
/backend     — REST API (Express + Prisma)
/bot         — Telegram Bot
/admin       — Административная панель (будет в следующих частях)
```

## Установка

### Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
```

### Frontend
```bash
cd frontend
npm install
```

### Bot
```bash
cd bot
npm install
```

## Запуск

### Backend
```bash
cd backend
npm run dev
# Запустится на http://localhost:3001
```

### Frontend
```bash
cd frontend
npm run dev
# Запустится на http://localhost:5173
```

### Bot
```bash
cd bot
npm run dev
```

## Environment Variables

Скопируй `.env.example` в `.env` для каждого модуля и заполни значения.

| Переменная | Описание |
|-----------|---------|
| `DATABASE_URL` | URL базы данных (SQLite: `file:./prisma/dev.db`) |
| `PORT` | Порт backend сервера (по умолчанию 3001) |
| `FRONTEND_URL` | URL frontend для CORS |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота (получить у @BotFather) |
| `WEBAPP_URL` | Публичный URL Web App |

⚠️ **Никогда не коммить реальные секреты в репозиторий!**

## API Endpoints

| Метод | Endpoint | Описание |
|-------|---------|---------|
| GET | `/api/cities` | Список городов |
| GET | `/api/categories` | Список категорий |
| GET | `/api/products` | Список товаров (фильтры: cityId, categoryId, search) |
| GET | `/api/products/:id` | Конкретный товар |
| GET | `/api/products/recommended/list` | Рекомендуемые товары |
| POST | `/api/users/auth` | Авторизация пользователя |
| PATCH | `/api/users/:telegramId/city` | Обновить город пользователя |
| GET | `/api/cart/:telegramId` | Получить корзину |
| POST | `/api/cart/:telegramId/items` | Добавить/обновить товар в корзине |
| DELETE | `/api/cart/:telegramId/items/:productId` | Удалить товар из корзины |

## Функционал (Часть 1)

- [x] Telegram WebApp SDK интеграция
- [x] Выбор города при первом входе
- [x] Каталог товаров с фильтрацией по городу и категории
- [x] Поиск товаров
- [x] Страница товара с гибким выбором количества
- [x] Рабочая корзина
- [x] Профиль пользователя с возможностью смены города
- [x] Рекомендуемые товары в корзине

## Планы (следующие части)

- [ ] Платежи (Telegram Payments, Stripe, TON)
- [ ] Внутренний баланс
- [ ] Казино
- [ ] Поддержка / операторы
- [ ] Доставка и самовывоз
- [ ] Полноценная админка
