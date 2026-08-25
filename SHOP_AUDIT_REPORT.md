# SHOP_AUDIT_REPORT

Дата аудита: 2026-08-25
Репозиторий: `anyya420-dev/Telegram-shop`
Ветка аудита: `copilot/restore-last-working-narcos-shop`

---

## 1) Полная структура проекта

Ниже фактическая структура **всех tracked-файлов** (`git ls-files`):

```text
.env.example
.gitignore
.npmrc
README.md
admin/README.md
backend/package.json
backend/prisma/migrations/20260821015844_add_features/migration.sql
backend/prisma/migrations/20260825144000_add_admin_server_sessions/migration.sql
backend/prisma/migrations/migration_lock.toml
backend/prisma/schema.prisma
backend/prisma/seed.ts
backend/src/index.ts
backend/src/lib.ts
backend/src/routes/admin.ts
backend/src/routes/balance.ts
backend/src/routes/cart.ts
backend/src/routes/casino.ts
backend/src/routes/catalog.ts
backend/src/routes/categories.ts
backend/src/routes/cities.ts
backend/src/routes/delivery.ts
backend/src/routes/discounts.ts
backend/src/routes/orders.ts
backend/src/routes/products.ts
backend/src/routes/reviews.ts
backend/src/routes/session.ts
backend/src/routes/support.ts
backend/src/routes/users.ts
backend/src/routes/wishlist.ts
backend/src/services/adminSession.ts
backend/src/services/notifier.ts
backend/test/admin-auth.test.ts
backend/tsconfig.json
bot/package.json
bot/src/index.ts
bot/tsconfig.json
database/prisma/schema.prisma
database/src/seed.ts
frontend/.gitignore
frontend/.oxlintrc.json
frontend/README.md
frontend/index.html
frontend/package.json
frontend/public/favicon.svg
frontend/public/icons.svg
frontend/public/products/charger.svg
frontend/public/products/coffee.svg
frontend/public/products/headphones.svg
frontend/public/products/tshirt.svg
frontend/src/App.tsx
frontend/src/api/client.test.ts
frontend/src/api/client.ts
frontend/src/components/BottomNav.tsx
frontend/src/components/CityPicker.tsx
frontend/src/components/Layout/Layout.module.css
frontend/src/components/Layout/Layout.tsx
frontend/src/components/PagePlaceholder.tsx
frontend/src/components/ProductCard.tsx
frontend/src/components/ProductCard/ProductCard.module.css
frontend/src/components/ProductCard/ProductCard.tsx
frontend/src/components/QuantitySelector.tsx
frontend/src/context/AppContext.tsx
frontend/src/i18n/index.tsx
frontend/src/i18n/locales/en.ts
frontend/src/i18n/locales/ru.ts
frontend/src/index.css
frontend/src/lib/api.ts
frontend/src/lib/format.ts
frontend/src/lib/i18n.ts
frontend/src/lib/localized.ts
frontend/src/lib/telegram.ts
frontend/src/lib/utils.ts
frontend/src/locales/en.json
frontend/src/locales/ru.json
frontend/src/main.tsx
frontend/src/pages/AdminPage.module.css
frontend/src/pages/AdminPage.tsx
frontend/src/pages/BalancePage.module.css
frontend/src/pages/BalancePage.tsx
frontend/src/pages/CartPage.module.css
frontend/src/pages/CartPage.tsx
frontend/src/pages/CasinoPage.module.css
frontend/src/pages/CasinoPage.tsx
frontend/src/pages/CatalogPage.module.css
frontend/src/pages/CatalogPage.tsx
frontend/src/pages/CheckoutPage.module.css
frontend/src/pages/CheckoutPage.tsx
frontend/src/pages/CitySelectPage.module.css
frontend/src/pages/CitySelectPage.tsx
frontend/src/pages/HomePage.module.css
frontend/src/pages/HomePage.tsx
frontend/src/pages/OrderDetailPage.module.css
frontend/src/pages/OrderDetailPage.tsx
frontend/src/pages/OrdersPage.module.css
frontend/src/pages/OrdersPage.tsx
frontend/src/pages/PlaceholderPage.module.css
frontend/src/pages/ProductPage.module.css
frontend/src/pages/ProductPage.tsx
frontend/src/pages/ProfilePage.module.css
frontend/src/pages/ProfilePage.tsx
frontend/src/pages/ShopPage.module.css
frontend/src/pages/ShopPage.tsx
frontend/src/pages/SupportPage.module.css
frontend/src/pages/SupportPage.tsx
frontend/src/pages/WishlistPage.module.css
frontend/src/pages/WishlistPage.tsx
frontend/src/styles/global.css
frontend/src/types.ts
frontend/src/types/product.ts
frontend/src/vite-env.d.ts
frontend/tsconfig.app.json
frontend/tsconfig.json
frontend/tsconfig.node.json
frontend/vite.config.ts
package-lock.json
package.json
render.yaml
scripts/production-smoke-test.mjs
```

---

## 2) Что сейчас реально работает

Проверено фактически командами:
- `npm install`
- `npm run test`
- `npm run typecheck`
- `npm run build`

Все прошли успешно.

Реально рабочие блоки:
- Backend стартует и собирается (`backend/src/index.ts`).
- Health/readiness endpoints работают (`/health`, `/api/health`, `/ready`, `/api/ready`).
- Базовый user-session bootstrap через Telegram initData или demo mode (`/api/session/bootstrap`).
- Каталог/города/категории/товар по id работают.
- Корзина (добавление/изменение/удаление) работает.
- Оформление заказа работает (создание order, списание stock, очистка cart).
- История заказов + карточка заказа + cancel/refund request работает.
- Баланс и top-up (симуляция) работают.
- Казино (dice) с изменением баланса работает.
- Wishlist, reviews, support tickets работают.
- Admin auth через server-side cookie session работает (логин/логаут/status + защищённые admin endpoints).
- Render-конфиг актуальный, smoke-скрипт production присутствует.

---

## 3) Что работает частично

1. **Платежи**
   - Есть только `POST /api/balance/topup` как симуляция пополнения.
   - Нет внешнего провайдера, нет webhook, нет статусов real payment.

2. **Admin panel (frontend)**
   - Есть вход, вкладки статистики/заказов/скидок/поддержки/audit.
   - Но нет полного CRUD по товарам/категориям/городам в UI.

3. **Frontend архитектура**
   - Есть рабочий новый слой `frontend/src/api/client.ts`.
   - Одновременно остались legacy-файлы (`frontend/src/lib/api.ts`, `frontend/src/components/ProductCard.tsx`, `frontend/src/i18n/index.tsx` и др.), которые создают техдолг и риск расхождений.

4. **Локальная конфигурация API**
   - Клиент ждёт `VITE_API_URL` (обычно с `/api`), иначе будет пустой префикс.
   - В dev это легко сломать при неверной `.env`-конфигурации.

---

## 4) Что сломано / проблемно

1. **Документация частично устарела и противоречива**
   - В README указан `Database | SQLite`, а фактический backend Prisma datasource = `postgresql`.
   - В репозитории осталась legacy-папка `database/` со старым SQLite schema, не используемая текущим backend.

2. **Следы большого рефакторинга без полной зачистки legacy**
   - Много старых/дублирующих сущностей во frontend.
   - Это не “runtime crash” прямо сейчас, но мешает поддержке и ускоряет накопление багов.

3. **Нет реального payment pipeline**
   - Нельзя считать магазин production-ready по оплатам.

4. **Нет выделенного полного smoke/e2e пути “покупка с реальной оплатой”**
   - Unit/integration есть, но полноценный payment-to-order flow отсутствует по архитектуре.

---

## 5) Какие функции магазина уже реализованы

- Bootstrap user session (Telegram + demo mode).
- Мультиязычность RU/EN (frontend + частично backend translations fields).
- Выбор города и city-scoped каталог.
- Каталог, поиск, фильтрация по категориям.
- Карточка товара, quantity rules (min/step/max).
- Корзина с пересчётом subtotal/total и рекомендациями.
- Checkout с delivery option + discount code + comment.
- Orders list/detail, статусная история.
- Отмена заказа, запрос refund.
- Wishlist.
- Reviews.
- Support tickets (user/admin replies).
- Balance и casino.
- Admin panel API + admin auth через cookie sessions.
- Audit logs и admin stats.

---

## 6) Какие функции отсутствуют

- Интеграция с реальным платежным шлюзом (Stripe/CloudPayments/etc).
- Payment webhook processing + idempotency.
- Payment statuses и привязка к lifecycle заказа.
- Полный admin CRUD для категорий/городов/товаров в frontend UI.
- Управление контентом/баннерами/промо в админке.
- Полноценный anti-fraud/anti-abuse слой для денежных операций.
- Резервирование стока по таймеру до оплаты (hold/release).

---

## 7) Что есть во frontend

Основной рабочий app:
- `frontend/src/App.tsx` (роутинг)
- `frontend/src/context/AppContext.tsx` (глобальный state + bootstrap + cart/orders ops)
- `frontend/src/api/client.ts` (API-клиент с разделением public/admin transport)
- `frontend/src/pages/*` (Home/Catalog/Shop/Product/Cart/Checkout/Orders/Admin/Profile/etc)
- `frontend/src/lib/i18n.ts` + `frontend/src/locales/*.json`

Слои/артефакты legacy (техдолг):
- `frontend/src/lib/api.ts` (старый клиент)
- `frontend/src/i18n/index.tsx` + `frontend/src/i18n/locales/*.ts`
- `frontend/src/components/ProductCard.tsx`, `BottomNav.tsx`, `QuantitySelector.tsx`, `PagePlaceholder.tsx` (часть не участвует в текущем маршруте)

---

## 8) Что есть в backend

- Express app: `backend/src/index.ts`
- Общие утилиты/авторизация/маппинг: `backend/src/lib.ts`
- Полный набор REST routes в `backend/src/routes/*`
- Prisma schema + migrations + seed: `backend/prisma/*`
- Admin session service: `backend/src/services/adminSession.ts`
- Telegram notifier: `backend/src/services/notifier.ts`
- Тесты admin/cors/auth: `backend/test/admin-auth.test.ts`

---

## 9) Какие API endpoints существуют

### Service
- `GET /health`
- `GET /api/health`
- `GET /ready`
- `GET /api/ready`

### Session
- `POST /api/session/bootstrap`

### Catalog / Product / Taxonomy
- `GET /api/cities`
- `GET /api/categories`
- `GET /api/catalog?cityId=&search=&categoryId=`
- `GET /api/products/recommended/list?cityId=`
- `GET /api/products?cityId=&categoryId=&search=`
- `GET /api/products/:productId?cityId=`

### User
- `GET /api/users/me`
- `PATCH /api/users/city`
- `PATCH /api/users/language`

### Cart
- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:itemId`
- `DELETE /api/cart/items/:itemId`

### Orders
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders`
- `POST /api/orders/:id/cancel`
- `POST /api/orders/:id/refund-request`

### Balance / Casino
- `GET /api/balance`
- `POST /api/balance/topup`
- `POST /api/casino/spin`
- `GET /api/casino/history`

### Support / Discounts / Reviews / Wishlist / Delivery
- `GET /api/support`
- `POST /api/support`
- `POST /api/support/:id/reply`
- `POST /api/discounts/validate`
- `GET /api/reviews?productId=`
- `POST /api/reviews`
- `DELETE /api/reviews/:productId`
- `GET /api/wishlist`
- `POST /api/wishlist`
- `DELETE /api/wishlist/:productCityId`
- `GET /api/delivery`

### Admin
- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/auth/status`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`
- `PATCH /api/admin/orders/:id/refund`
- `GET /api/admin/products`
- `PATCH /api/admin/products/:id`
- `PATCH /api/admin/product-cities/:id`
- `GET /api/admin/users`
- `GET /api/admin/discounts`
- `POST /api/admin/discounts`
- `PATCH /api/admin/discounts/:id`
- `GET /api/admin/delivery-options`
- `POST /api/admin/delivery-options`
- `PATCH /api/admin/delivery-options/:id`
- `GET /api/admin/support`
- `POST /api/admin/support/:id/reply`
- `GET /api/admin/audit-logs`
- `GET /api/admin/stats`

---

## 10) Как устроены authentication и admin

### User auth
- Вход через Telegram initData (`verifyTelegramInitData`) или demo mode.
- После bootstrap backend выдаёт HMAC session token (`createSessionToken`).
- User endpoints читают `Authorization` (****** token) или `X-Session-Token`.

### Admin auth
- Пароль хранится в `admin_security` (scrypt hash + salt).
- Сессии в `admin_sessions` (hash token, expiresAt, revoke).
- Cookie `tg_shop_admin_session`:
  - `httpOnly=true`
  - `secure=true` в production
  - `sameSite=none` в production
  - path `/api/admin`
- Все admin endpoints требуют активную server session.

---

## 11) Как устроены товары, категории, корзина и заказы

- `Category` -> `Product` -> `ProductCity`.
- `ProductCity` задаёт stock и quantity rules (`minimumQuantity`, `quantityStep`, `maximumQuantity`) per city.
- Cart хранит ссылки на `ProductCity` + quantity.
- Checkout:
  - валидирует доступность/stocks,
  - считает subtotal,
  - применяет delivery + discount,
  - создаёт `Order` + `OrderItem`,
  - пишет `OrderStatusHistory`,
  - уменьшает stock,
  - очищает cart.
- Order cancellation:
  - только `pending|confirmed`,
  - восстанавливает stock,
  - добавляет status history.
- Refund request:
  - только для `delivered|cancelled`,
  - ставит `refundStatus=requested`.

---

## 12) Что есть с оплатой

Фактически:
- Реальных онлайн-платежей **нет**.
- Есть симуляция пополнения баланса (`POST /api/balance/topup`).
- Refund approval в админке возвращает деньги на internal balance.

Итог: платёжная часть пока внутренне-симуляционная, не интегрирована с внешним PSP.

---

## 13) Как frontend связан с backend

- Главный API-клиент: `frontend/src/api/client.ts`.
- Public API: credentials=`omit`, bearer token для user-session.
- Admin API: credentials=`include`, опора на HttpOnly cookie сессии.
- Базовый URL берётся из `VITE_API_URL`.
- В dev `vite.config.ts` имеет proxy `/api -> http://localhost:3001`, но методы клиента используют пути вроде `/session/bootstrap`, поэтому нужен корректный `VITE_API_URL` (обычно `http://localhost:3001/api` или `/api`).

---

## 14) Как проект деплоится через Render

`render.yaml` поднимает 3 сервиса:
1. PostgreSQL database: `narcos-shop-db2.0`
2. Backend web service: `Narcos-shop`
3. Frontend static service: `Telegram-shop`
4. Optional bot worker: `telegram-shop-bot`

Ключевые моменты:
- Backend build: `npm install --include=dev && npm run build --workspace backend`
- Backend preDeploy: `npm run db:migrate:deploy --workspace backend`
- Frontend build: `npm install && npm run build --workspace frontend`
- Frontend `VITE_API_URL` указывает на `https://narcos-shop.onrender.com/api`

---

## 15) Какие проблемы мешают полноценной работе магазина

1. Нет real payment integration.
2. Нет webhook-driven подтверждения оплат.
3. Документация/структура частично рассинхронизированы (SQLite legacy vs PostgreSQL production).
4. Техдолг из legacy frontend файлов/слоёв.
5. Неполный admin UX (нет полного CRUD/операционного контура).
6. Нет завершённого production runbook для payment incidents/refunds/disputes.

---

## 16) Что нужно сделать для полностью рабочего Telegram Shop

1. Внедрить платёжный провайдер (create payment intent + redirect/deeplink).
2. Добавить webhook endpoint с подписью и idempotency.
3. Связать payment status с order status machine.
4. Добавить stock hold/release до финального подтверждения оплаты.
5. Доделать admin UI для ключевых CRUD-операций.
6. Привести документацию и структуру к единому состоянию (удалить/изолировать legacy).
7. Добавить production smoke/e2e для критических бизнес-сценариев.

---

## 17) Какие конкретно файлы нужно изменить для каждой задачи

### A. Реальные платежи
- `backend/src/routes/orders.ts` (инициация payment flow)
- `backend/src/routes/balance.ts` (убрать роль “псевдо-оплаты”)
- `backend/prisma/schema.prisma` (payment сущности/поля)
- `backend/prisma/migrations/*` (новая миграция)
- `frontend/src/pages/CheckoutPage.tsx` (UI оплаты)
- `frontend/src/api/client.ts` (новые payment endpoints)
- `README.md`, `.env.example`, `render.yaml` (новые env vars)

### B. Webhook + idempotency
- `backend/src/index.ts` (mount webhook route)
- `backend/src/routes/*payment*.ts` (новый webhook route)
- `backend/src/lib.ts` (утилиты валидации подписи)
- `backend/prisma/schema.prisma` (+ migration)

### C. Admin CRUD (товары/категории/города)
- `backend/src/routes/admin.ts`
- `frontend/src/pages/AdminPage.tsx`
- `frontend/src/pages/AdminPage.module.css`
- `frontend/src/api/client.ts`

### D. Зачистка legacy frontend
- `frontend/src/lib/api.ts` (удалить/заменить импортами только после проверки)
- `frontend/src/i18n/*` (оставить один i18n stack)
- `frontend/src/components/ProductCard.tsx`, `BottomNav.tsx`, `QuantitySelector.tsx`, `PagePlaceholder.tsx` (либо удалить, либо явно интегрировать)
- `frontend/src/types/product.ts` (если не используется)

### E. Документация и эксплуатация
- `README.md`
- `admin/README.md`
- `frontend/README.md`
- `scripts/production-smoke-test.mjs`

---

## 18) Какие изменения могут затронуть Narcos City

Под “Narcos City/Narcos” здесь фактически задеты прод-артефакты с именованием Narcos:
- `render.yaml`:
  - backend service name `Narcos-shop`
  - DB name `narcos-shop-db2.0`
  - backend URL `https://narcos-shop.onrender.com`
- `scripts/production-smoke-test.mjs` (production backend URL)
- `FRONTEND_URL`/`WEB_APP_URL`/`VITE_API_URL` в Render env

Любые изменения payment/auth/deploy могут косвенно влиять на прод-сервис Narcos.

---

## 19) Какие изменения НЕЛЬЗЯ делать

1. Нельзя массово переписывать рабочий backend/frontend без поэтапной проверки.
2. Нельзя удалять рабочие маршруты, пока нет обратной совместимости.
3. Нельзя менять/ломать Render production имена и URLs Narcos без миграционного плана.
4. Нельзя отключать CORS-защиту и admin cookie security-параметры.
5. Нельзя коммитить секреты (`SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`, `ADMIN_PASSWORD`, payment keys).
6. Нельзя менять бизнес-логику заказов и stock без транзакционной целостности.

---

## 20) Самый быстрый и безопасный порядок реализации недостающих функций

1. **Стабилизация документации и конфигов (без изменения бизнес-логики)**
   - выровнять README/.env/deploy инструкции.
2. **Платёжный каркас в backend (без включения в production)**
   - добавить payment сущности + webhook route behind feature flag.
3. **Интеграция checkout с payment intent (frontend + backend)**
   - сначала sandbox режим.
4. **Webhook + idempotency + order state transitions**
   - закрыть риск двойных списаний/гонок.
5. **Stock hold/release и корректный timeout сценарий**
   - чтобы не терять остатки.
6. **Admin UI расширение (операционка)**
   - CRUD и контроль платежных/заказных инцидентов.
7. **Зачистка legacy frontend кода**
   - только после прохождения regressions.
8. **Production smoke/e2e и rollout**
   - staged rollout, затем включение флага оплаты.

---

## Отдельная проверка текущих незакоммиченных изменений

Проверено `git status`:
- Working tree clean.
- Незакоммиченных локальных изменений **нет**.

## Почему сейчас отображается большое количество изменённых файлов

Причина не в локальном “грязном” состоянии, а в **разнице текущей ветки с `origin/main`**.

Факты:
- `git rev-list --left-right --count origin/main...HEAD` → `0 10` (ветка впереди main на 10 коммитов).
- `git diff --stat origin/main...HEAD` → `88 files changed, 1800 insertions(+), 8933 deletions(-)`.

То есть “много changed files” — это накопленный diff PR/ветки (крупный рефактор/восстановление baseline/admin-auth переcборка), а не текущие незакоммиченные правки в рабочей копии.
