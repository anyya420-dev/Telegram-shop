# Telegram Shop — Clean Rebuild Report

## Root Cause

Migration `20260825140000_add_admin_server_sessions` was left in a **failed** state in the
production `_prisma_migrations` table (Prisma error P3009).

**Primary cause:** The migration had already partially or fully succeeded in Postgres (because
its SQL used `CREATE TABLE IF NOT EXISTS`), but the Prisma migration history row was recorded as
`failed`. This happens when the database command succeeds but Prisma's migration runner crashes or
is killed before it can write the success status.

**Secondary cause (broken fix):** A previous fix (PR #42) introduced two layers of hacks:

1. `backend/package.json` `db:migrate:deploy` ran `prisma migrate resolve --rolled-back <id>
   2>/dev/null || true` unconditionally before every deploy. This silently swallowed all errors
   and could corrupt migration history on subsequent runs.

2. `backend/package.json` `prestart` called `db:migrate:deploy`, so migrations ran again on
   every server restart (in addition to the Render preDeployCommand).

**Tertiary cause (incomplete cleanup):** The subsequent fix (commit `ee6b686`) cleaned up
`backend/package.json` but left `render.yaml` with a new recovery fallback:

```
(migrate deploy || (resolve --rolled-back 20260825140000... && migrate deploy))
```

This is still a hardcoded hack: it embeds a specific migration ID in the deployment
infrastructure, silently retries on any `migrate deploy` failure, and is not
idempotent across all failure modes.

---

## Broken Code Found

| Location | Issue |
|---|---|
| `render.yaml` preDeployCommand | Hardcoded `resolve --rolled-back 20260825140000_add_admin_server_sessions` fallback |
| Previous `backend/package.json` | `2>/dev/null \|\| true` silencing errors (removed in ee6b686) |
| Previous `backend/package.json` prestart | Running migrations on server restart (removed in ee6b686) |

---

## Files Rewritten / Changed

### `render.yaml`

**Before:**
```yaml
preDeployCommand: npm run db:generate --workspace backend && (cd backend && npx prisma migrate deploy --schema ./prisma/schema.prisma || (npx prisma migrate resolve --rolled-back 20260825140000_add_admin_server_sessions --schema ./prisma/schema.prisma && npx prisma migrate deploy --schema ./prisma/schema.prisma))
```

**After:**
```yaml
preDeployCommand: npm run db:generate --workspace backend && npm run db:migrate:deploy --workspace backend
```

### `backend/package.json` (already clean from ee6b686, no further changes needed)

```json
"prestart": "npm run db:generate",
"db:migrate:deploy": "npm exec -- prisma migrate deploy --schema ./prisma/schema.prisma"
```

---

## Files Removed

None. The admin authentication implementation (`adminSession.ts`, `admin.ts`, migration SQL)
was already correct and is unchanged.

---

## Migration Changes

The migration file `20260825140000_add_admin_server_sessions/migration.sql` is unchanged.
It uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` throughout, making it
safe to re-execute.

The **production migration repair** is handled as follows:
- If the migration is already marked `applied` in `_prisma_migrations`: `migrate deploy` is a
  no-op for that migration. ✓
- If the migration is still marked `failed` in `_prisma_migrations` at the time of the next
  Render deploy: `migrate deploy` will fail with P3009. In that case, run manually:
  ```
  prisma migrate resolve --rolled-back 20260825140000_add_admin_server_sessions
  prisma migrate deploy
  ```
  Or trigger via Render shell before deploying.

The clean `preDeployCommand` makes failures **visible** rather than hiding them.

---

## Authentication Changes

None. The admin session implementation is clean and complete:

- `POST /api/admin/auth/login` — verifies scrypt password, creates server-side session,
  sets `HttpOnly; Secure; SameSite=None; Path=/api/admin` cookie, returns `{ok:true}`
- `GET /api/admin/auth/status` — validates session, returns `{authenticated:true}` or 401
- `POST /api/admin/auth/logout` — revokes session, clears cookie, returns `{ok:true}`
- `GET /api/admin/stats` — protected; requires valid session
- Session tokens are never exposed to JavaScript. Password is never stored in session.
- `getAdminCookieOptions()` is the single authoritative source of cookie configuration.
- `writeAdminCookie()` and `clearAdminCookie()` both use it.

---

## Cookie Configuration

Production:
```
HttpOnly: true
Secure: true
SameSite: none
Path: /api/admin
```

Development (NODE_ENV !== production):
```
HttpOnly: true
Secure: false
SameSite: lax
Path: /api/admin
```

---

## CORS Configuration

- Allowed origins: `https://telegram-shop-3781.onrender.com` (production)
- Development adds: localhost origins and any `CORS_ALLOWED_ORIGINS` env var
- `Access-Control-Allow-Credentials: true`
- No wildcard origin with credentials
- Invalid origins receive `403 cors_origin_not_allowed`

---

## Frontend

No changes. `frontend/src/api/client.ts` correctly uses:
- `const adminRequest = createApiClient({ credentials: 'include', includeSessionToken: false })`
- All admin API calls go through `adminRequest`
- No tokens in localStorage

---

## Tests Performed

```
npm run typecheck  — PASS
npm run build      — PASS
npm run test --workspace backend — PASS (3/3 tests)
```

Tests cover:
- Admin login success (200, Set-Cookie with HttpOnly/Secure/SameSite=None/Path=/api/admin)
- Admin login failure (401)
- Stats without session (401)
- Stats with valid session (200)
- Session flow: login → status → stats → logout → stats again (401)
- CORS: correct origin (204 preflight), disallowed origin (403), no origin (200)
- Payment settings CRUD with admin auth
- Checkout flow with payment method

---

## Production State

**IMPORTANT — PART 2 MUST VERIFY:**

1. Log into the Render dashboard and check the migration status:
   - Open a Render shell on `Narcos-shop`
   - Run: `npx prisma migrate status --schema ./prisma/schema.prisma`
   - Confirm `20260825140000_add_admin_server_sessions` shows as `Applied`
   - If it still shows `Failed`: run `npx prisma migrate resolve --rolled-back 20260825140000_add_admin_server_sessions --schema ./prisma/schema.prisma` then trigger a new deploy.

2. After next Render deploy (triggered by this commit):
   - Verify `preDeployCommand` completes with exit 0
   - Verify `/api/health` returns 200
   - Verify `GET /api/admin/auth/status` returns 401 (not 500) without a session
   - Test admin login via browser at `https://telegram-shop-3781.onrender.com/admin`
   - Verify Set-Cookie is present with correct attributes
   - Verify `/api/admin/stats` returns 200 with valid session
   - Verify logout clears the session

3. Verify no Narcos City / shop functionality was broken.

---

## Remaining Checks for PART 2

| Check | Method |
|---|---|
| Migration status in production DB | Render shell: `prisma migrate status` |
| Backend health | `GET https://narcos-shop.onrender.com/api/health` |
| Admin status unauthenticated | `GET /api/admin/auth/status` → expect 401 |
| Admin login | `POST /api/admin/auth/login` with ADMIN_PASSWORD → expect 200 + cookie |
| Admin status authenticated | `GET /api/admin/auth/status` with cookie → expect 200 |
| Admin stats authenticated | `GET /api/admin/stats` with cookie → expect 200 |
| Admin logout | `POST /api/admin/auth/logout` → expect 200 |
| Admin stats after logout | `GET /api/admin/stats` → expect 401 |
| Browser flow | Open `/admin`, login, verify panel loads, logout |
| P3009 resolved | Render deploy log shows no P3009 |

---

## Commit

See `git log --oneline -1` for the commit hash of this clean rebuild.
