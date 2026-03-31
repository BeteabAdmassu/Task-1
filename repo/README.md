# GreenLeaf Operations Suite

A full-stack procurement, warehouse, and plant-care knowledge management system built with NestJS + TypeORM (backend) and React + Vite (frontend).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| PostgreSQL | ≥ 16 |
| Git | any recent |

---

## Environment Setup

### 1. Create the PostgreSQL database

```sql
-- Run as a PostgreSQL superuser
CREATE USER greenleaf WITH PASSWORD 'greenleaf_secret';
CREATE DATABASE greenleaf_db OWNER greenleaf;
-- Required for full-text search and trigram similarity
\c greenleaf_db
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 2. Configure backend environment variables

Create `repo/server/.env` (or export these variables in your shell):

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=greenleaf
DB_PASS=greenleaf_secret
DB_NAME=greenleaf_db

# Auth — CHANGE THESE before production use
JWT_SECRET=replace-with-a-long-random-string
SESSION_TIMEOUT_MINUTES=30

# Bootstrap admin — set ONCE for initial setup, then unset
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_PASSWORD=ChangeMe!2024

# API
API_PORT=3001
CORS_ORIGIN=http://localhost:3000
```

> **Security:** `ADMIN_BOOTSTRAP_PASSWORD` is used exactly once to seed the initial
> administrator account. Remove it from your environment after the first login and
> password change. No hardcoded credential exists in the source code.

---

## Database Migration

Migrations run automatically when the server starts (`migrationsRun: true`).

To run them manually:

```bash
cd repo/server
npm run migration:run
```

To revert the last migration:

```bash
npm run migration:revert
```

---

## Running Locally (non-Docker)

### Backend

```bash
cd repo/server
npm install
npm run start:dev       # watch mode — restarts on file changes
```

The API will be available at `http://localhost:3001/api`.

### Frontend

```bash
cd repo/client
npm install
npm run dev             # Vite dev server with HMR
```

The app will be available at `http://localhost:3000`.

The Vite dev server proxies `/api/*` requests to `http://localhost:3001`, so
both server and client can run on the same machine without CORS issues during development.

---

## First-Login Bootstrap

1. Ensure `ADMIN_BOOTSTRAP_PASSWORD` is set in the server environment.
2. Start the server — the migration seeds the admin user with `mustChangePassword = true`.
3. Open `http://localhost:3000` and log in with:
   - **Username:** value of `ADMIN_BOOTSTRAP_USERNAME` (default: `admin`)
   - **Password:** value of `ADMIN_BOOTSTRAP_PASSWORD`
4. You will be redirected to a forced password-change screen.
5. Set a strong password. After saving, `ADMIN_BOOTSTRAP_PASSWORD` can be removed from the environment.

---

## Verification Steps & Expected Outputs

### Backend health

```bash
curl http://localhost:3001/api/health
# → {"status":"ok"}
```

### Auth — rate limiting (should 429 after 10 rapid attempts)

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3001/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"x","password":"y"}'
done
# First 10 → 401; 11th → 429
```

### Security headers (Helmet)

```bash
curl -I http://localhost:3001/api/health | grep -i x-frame
# → x-frame-options: SAMEORIGIN
```

### Backend tests

```bash
cd repo/server
npm test
# Test Suites: 3 passed, 3 total
# Tests:       28 passed, 28 total
```

### Frontend tests

```bash
cd repo/client
npm test
# Test Files  3 passed (3)
# Tests  16 passed (16)
```

---

## Project Structure

```
repo/
├── server/                 NestJS API
│   ├── src/
│   │   ├── auth/           JWT + session auth, change-password
│   │   ├── bootstrap/      Startup admin-existence check
│   │   ├── procurement/    Purchase requests, approvals, low-stock alerts
│   │   ├── purchase-orders/
│   │   ├── receiving/      Goods receiving, putaway locations
│   │   ├── returns/        Return authorizations, restocking fee engine
│   │   ├── suppliers/      Supplier CRUD + portal
│   │   ├── funds-ledger/
│   │   ├── knowledge-base/ Articles, versioning, favorites
│   │   ├── search/         Full-text search, synonyms
│   │   ├── notifications/  In-app notification center
│   │   ├── data-quality/   Deduplication, quality checks
│   │   ├── observability/  Structured logs, job metrics, system stats
│   │   └── migrations/     15 sequential DB migrations
│   └── package.json
└── client/                 React + Vite SPA
    ├── public/sw.js        User-scoped offline KB cache
    ├── src/
    │   ├── api/            Typed fetch wrappers per domain
    │   ├── components/     Layout, Sidebar, TopNav, NotificationBell
    │   ├── contexts/       AuthContext (login/logout/SW cache lifecycle)
    │   ├── pages/          One component per route
    │   └── __tests__/      Vitest test suite
    └── package.json
```

---

## Key Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `greenleaf` | Database user |
| `DB_PASS` | `greenleaf_secret` | Database password |
| `DB_NAME` | `greenleaf_db` | Database name |
| `JWT_SECRET` | *(insecure default)* | JWT signing secret — **must be overridden** |
| `SESSION_TIMEOUT_MINUTES` | `30` | Sliding session window |
| `API_PORT` | `3001` | Backend listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `ADMIN_BOOTSTRAP_USERNAME` | `admin` | Initial admin username (one-time) |
| `ADMIN_BOOTSTRAP_PASSWORD` | *(none)* | Initial admin password (one-time) |
| `NODE_ENV` | — | Set to `production` to enable secure cookies |

---

## Offline Behavior

The service worker (`public/sw.js`) caches Knowledge Base article API calls
using a network-first strategy with per-user cache keys.

- **On login:** the SW is told the current user ID via `postMessage`; responses are stored under `greenleaf-kb-v2-<userId>`.
- **On logout:** the SW receives a `CLEAR_CACHE` message and deletes **all** caches before the session is invalidated, preventing data leakage between users on shared workstations.
- **Offline:** cached article responses are served; non-cached requests return a `503` JSON error.

---

## Roles

| Role | Access |
|------|--------|
| `ADMINISTRATOR` | Full access to all modules |
| `PROCUREMENT_MANAGER` | Procurement, approvals, suppliers, purchase orders, returns |
| `WAREHOUSE_CLERK` | Receiving, goods receipt, putaway; can submit low-stock alerts |
| `PLANT_CARE_SPECIALIST` | Knowledge base only |
| `SUPPLIER` | Supplier portal (own POs and returns only) |
