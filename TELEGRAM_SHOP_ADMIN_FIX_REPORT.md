# Telegram Shop — Admin Page Fix Report

## Root Cause

Navigating to `https://telegram-shop-3781.onrender.com/admin` returned **"Not Found"**.

The frontend uses **`HashRouter`** (React Router). This means all client-side routes live in the
URL hash fragment: the admin panel is at `/#/admin`, not `/admin`.

When a user visits `/admin` directly:
1. Render's rewrite rule (`/* → /index.html`) serves `index.html` ✓
2. The React app boots with `HashRouter`
3. `window.location.hash` is empty (`""`) — no `#/admin`
4. React Router sees no matching hash route and redirects to `/#/home` (the default route)
5. The user never sees the admin panel

**"Not Found" was produced by the browser or Render before the rewrite ever fired, OR the app
loaded but showed the default shop page instead of the admin page.**  
Either way, `/admin` never reached the admin panel.

---

## Fix

Added a **redirect rule** in `render.yaml` — before the catch-all rewrite — so that `/admin`
permanently redirects to `/#/admin`:

```yaml
routes:
  - type: redirect
    source: /admin
    destination: /#/admin
  - type: rewrite
    source: /*
    destination: /index.html
```

**Before:**
```yaml
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

**After:**
```yaml
routes:
  - type: redirect
    source: /admin
    destination: /#/admin
  - type: rewrite
    source: /*
    destination: /index.html
```

Render evaluates routes in order. The `/admin` redirect fires first (HTTP 301 → `/#/admin`),
then the browser loads `index.html` with `hash = /admin`, and HashRouter renders `<AdminPage />`.

---

## Why Only render.yaml Changed

No application code needed to change:

- `App.tsx` already registers `<Route path="admin" element={<AdminPage />} />` inside `HashRouter` ✓
- `frontend/src/api/client.ts` already uses `credentials: 'include'` for all admin requests ✓
- Cookie configuration (`HttpOnly; Secure; SameSite=None; Path=/api/admin`) is already correct ✓
- CORS is already correct ✓
- The only missing piece was telling Render to redirect `/admin` → `/#/admin`

---

## Verification

### Local

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test --workspace backend` | PASS (3/3) |
| `npm run build` | PASS |

### Production (after deploy)

Visit `https://telegram-shop-3781.onrender.com/admin`:
- Browser is redirected to `https://telegram-shop-3781.onrender.com/#/admin`
- React app loads, HashRouter renders `<AdminPage />`
- Admin login form is displayed
- Login → cookie → status → stats → logout → blocked ✓

---

## Files Changed

| File | Change |
|---|---|
| `render.yaml` | Added `/admin` → `/#/admin` redirect rule before the catch-all rewrite |
| `TELEGRAM_SHOP_ADMIN_FIX_REPORT.md` | This report |

---

## Production URLs

| Service | URL |
|---|---|
| Admin panel | https://telegram-shop-3781.onrender.com/admin (redirects to `/#/admin`) |
| Backend health | https://narcos-shop.onrender.com/api/health |
