# GreenLeaf Operations Suite

A full-stack procurement, warehouse, and plant-care knowledge management system built with NestJS + TypeORM (backend) and React + Vite (frontend).

---

## Prerequisites

| Tool | Required for |
|------|-------------|
| Docker (with Compose plugin v2) | Running tests, running the full stack |
| Node.js ≥ 20 + npm ≥ 10 | Local development only (non-Docker) |
| PostgreSQL ≥ 16 | Local development only (non-Docker) |
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

# Field encryption — required for supplier sensitive fields (bankingNotes, internalRiskFlag)
FIELD_ENCRYPTION_KEY=replace-with-a-64-char-hex-string
```

Generate a strong key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
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

### Running tests

`run_tests.sh` is the canonical way to run the full test suite. It requires only
Docker — no Node.js, npm, or PostgreSQL on the host.

```bash
bash repo/run_tests.sh
```

It will:
1. Start (or reuse) the `db` container and wait for it to be healthy.
2. Run all 17 backend suites (Jest + DB-backed integration tests) inside the `api` container.
3. Run all 9 frontend suites (Vitest) inside the `web` container.
4. Exit `0` on full pass, `1` on any failure.

**Local development alternative** — if Node.js is installed on the host:

```bash
# Backend
cd repo/server && npm test

# Frontend
cd repo/client && npm test
```

### End-to-End tests (Playwright)

E2E tests run a login-flow smoke suite against a real browser.

Playwright automatically starts **two isolated servers** so tests never
interfere with the developer's running servers (ports 3000/3001):

| Server | Port | Purpose |
|--------|------|---------|
| NestJS backend | 3101 | Dedicated E2E backend with relaxed login throttle |
| Vite frontend | 3100 | Dev server proxying `/api/*` to port 3101 |

**One-time setup:**

```
cd repo/server
npx nest build

cd repo
npm install
npx playwright install chromium
```

**Prerequisites before each run:**

1. PostgreSQL running with the `greenleaf_db` database.
2. Demo seed loaded (provides test credentials):
   ```
   cd repo/server
   npm run seed:demo
   ```
3. Server compiled (only needed after backend code changes):
   ```
   cd repo/server
   npx nest build
   ```

**Run E2E tests:**

```
cd repo
npm run test:e2e
```

**Environment variables (optional):**

| Variable | Default | Description |
|----------|---------|-------------|
| `E2E_ADMIN_USER` | `demo_admin` | Username for the login test |
| `E2E_ADMIN_PASS` | `Demo1234!` | Password for the login test |
| `AUTH_LOGIN_THROTTLE_LIMIT` | `1000` (E2E) / `10` (prod) | Login attempts per 15 min — set via `playwright.config.ts` for E2E |

> **Note:** The E2E backend uses a fallback `JWT_SECRET` when none is set
> in the environment. This is safe because the E2E backend is ephemeral
> and shares the same database (same password hashes). If ports 3100/3101
> are already in use, Playwright will reuse the existing servers.

---

## Project Structure

```
repo/
├── docker-compose.yml      Full-stack service definitions (db, api, web)
├── run_tests.sh            CI test runner — requires Docker only
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
│   │   ├── budget/         Budget cap enforcement + authorized overrides
│   │   ├── data-quality/   Deduplication, quality checks
│   │   ├── observability/  Structured logs, job metrics, system stats
│   │   ├── seeds/          Non-production demo seed (npm run seed:demo)
│   │   └── migrations/     18 sequential DB migrations
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
| `JWT_SECRET` | **required** | JWT signing secret — server **will not start** without this |
| `SESSION_TIMEOUT_MINUTES` | `30` | Sliding session window |
| `API_PORT` | `3001` | Backend listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `ADMIN_BOOTSTRAP_USERNAME` | `admin` | Initial admin username (one-time) |
| `ADMIN_BOOTSTRAP_PASSWORD` | *(none)* | Initial admin password (one-time) |
| `FIELD_ENCRYPTION_KEY` | **required** | 32-byte hex key for AES-256-GCM encryption of supplier `bankingNotes` and `internalRiskFlag` fields |
| `NODE_ENV` | — | Set to `production` to enable secure cookies |

---

## Background Job Rollback Guarantee

All mutating scheduled jobs run inside a single database transaction per attempt.  A failed attempt is fully rolled back before the next retry, so no partial writes persist between attempts.

| Job | Mutation | Transaction strategy |
|-----|----------|----------------------|
| `dedup-scan` | Writes to `duplicate_candidates` | Internal `dataSource.transaction()` in `runDedupScan()` threads `EntityManager` through `checkForDuplicates()` |
| `notification-queue-drain` | Updates `isQueued` flag on notifications | `dataSource.transaction()` opened by the scheduler; `drainQueue(manager)` accepts the manager and routes all reads/writes through `manager.getRepository(Notification)` |
| `session-cleanup` | Deletes expired sessions | Single atomic `DELETE` statement — inherently atomic |
| `data-quality-check` | Read-only (in-memory report cache) | No transaction needed |

Retry behavior (up to 3 attempts with exponential backoff 1 s → 4 s → 16 s) is unchanged. Each retry opens a fresh transaction.

---

## Receiving Entry Modes

The Receive Goods screen (`/warehouse/receive`) supports two entry modes:

| Mode | Behavior |
|------|----------|
| **Manual Entry** | Operator types quantities directly into each line's numeric input. Tab/Enter moves to the next line. |
| **Barcode Scan** | A scan input field appears. The operator scans (or types) a barcode code and presses Enter. The system matches the code against each line's *scan code* (= `catalogItemId` when present, otherwise the first 8 characters of the line-item UUID). A successful scan increments that line's received quantity by 1. Feedback is shown below the scan input. |

The selected `entryMode` (`BARCODE` or `MANUAL`) is stored on the receipt record for audit purposes. Both modes require a variance reason code when `quantityReceived ≠ quantityExpected`.

**Server-enforced receiving integrity:** `quantityExpected` is derived server-side from the PO line item (`quantity − quantityReceived`) and is never accepted from the client. The API also rejects receipts where `quantityReceived` exceeds the remaining expected quantity (over-receipt) or where a `poLineItemId` does not belong to the target PO.

---

## Seed / Demo Data

A non-production seed creates one user per role plus minimal linked data for a full E2E walkthrough.

```bash
cd repo/server
npm run seed:demo
```

**All demo users share the password `Demo1234!`**

| Role | Username | Notes |
|------|----------|-------|
| `ADMINISTRATOR` | `demo_admin` | Always supervisor-eligible |
| `PROCUREMENT_MANAGER` | `demo_pm` | `isSupervisor = true` |
| `WAREHOUSE_CLERK` | `demo_clerk` | |
| `PLANT_CARE_SPECIALIST` | `demo_plantcare` | |
| `SUPPLIER` | `demo_supplier` | |

The seed is **idempotent** — re-running skips records that already exist. It refuses to run when `NODE_ENV=production`.

---

## Approval Chain

Purchase requests are approved according to a three-tier authority model:

| Tier | Amount | Required approvals | Eligible approvers |
|------|--------|--------------------|--------------------|
| 0 | ≤ $500.00 | None — auto-approved on submit | — |
| 1 | $500.01 – $5,000.00 | 1 approval | `ADMINISTRATOR` **or** any user with `isSupervisor = true` |
| 2 | > $5,000.00 | 2 approvals | At least one approver must be `ADMINISTRATOR` |

**`isSupervisor` flag** — a boolean column on the `users` table (default `false`). Grant it to trusted `PROCUREMENT_MANAGER` accounts to allow them to approve tier-1 requests. Only `ADMINISTRATOR` can set this flag via `PATCH /api/admin/users/:id`.

```bash
# Grant supervisor authority to a procurement manager
curl -X PATCH http://localhost:3001/api/admin/users/<id> \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isSupervisor": true}'
```

Additional enforced rules:
- A requester cannot approve their own request (regardless of role).
- An approver cannot approve the same request twice.
- REJECT actions do not require supervisor authority.

---

## Budget Cap Controls

### How it works

Each supplier can have an optional `budgetCap` (decimal, dollars). When set:

- **Committed amount** = SUM of `totalAmount` across that supplier's POs with status `ISSUED`, `PARTIALLY_RECEIVED`, or `FULLY_RECEIVED`.
- **Available** = `budgetCap` − committed.
- Issuing a PO (`PATCH /purchase-orders/:id/issue`) that would exceed the available budget is **blocked by default**.

Enforcement is race-safe: `pg_advisory_xact_lock` is acquired inside the issue transaction, preventing concurrent over-commit.

### Setting a budget cap

```bash
# PATCH /suppliers/:id  (ADMINISTRATOR or PROCUREMENT_MANAGER)
curl -X PATCH http://localhost:3001/api/suppliers/<id>   -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json"   -d '{"budgetCap": 50000}'

# Remove a cap (set to null)
curl -X PATCH http://localhost:3001/api/suppliers/<id>   -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json"   -d '{"budgetCap": null}'
```

### Authorized override (ADMINISTRATOR only)

When a PO would exceed the cap but business necessity requires proceeding, an ADMINISTRATOR can supply an override reason:

```bash
curl -X PATCH http://localhost:3001/api/purchase-orders/<id>/issue   -H "Authorization: Bearer $ADMIN_TOKEN"   -H "Content-Type: application/json"   -d '{"override": true, "overrideReason": "Emergency greenhouse restock approved by board"}'
```

The override is recorded in `budget_overrides` (poId, supplierId, authorizedBy, amount, available at time, reason, timestamp) and written to the audit log (`BUDGET_OVERRIDE` action).

---

## Payment Callback / Webhook Endpoint

```
POST /api/payments/callback   (public — no JWT required)
```

Receives inbound payment-provider webhooks.

**Request body:**
```json
{
  "idempotencyKey": "provider-event-id-abc123",
  "connectorName":  "noop",
  "event":          "payment.succeeded",
  "payload":        { "amount": 1500 }
}
```

Alternatively, supply the idempotency key via the `X-Idempotency-Key` header.

**Idempotency:** A duplicate delivery with the same key returns the cached result immediately — no side effects.

**Signature verification:** The connector's `verifyCallback(headers, body)` method is called first. The noop connector always accepts. Real connectors implement HMAC validation here.

### Verifying in noop / local mode

```bash
# First call — processed fresh
curl -s -X POST http://localhost:3001/api/payments/callback   -H "Content-Type: application/json"   -d '{"idempotencyKey":"test-001","event":"payment.succeeded"}' | jq .
# -> { "processed": true, "alreadyProcessed": false, "result": {...} }

# Duplicate call — returns cached result
curl -s -X POST http://localhost:3001/api/payments/callback   -H "Content-Type: application/json"   -d '{"idempotencyKey":"test-001","event":"payment.succeeded"}' | jq .
# -> { "processed": true, "alreadyProcessed": true, "result": {...} }
```

---

## Offline UX

The **Search** (`/plant-care/search`) and **Notifications** (`/notifications`) pages distinguish between network loss and server errors:

| Condition | UI shown |
|-----------|----------|
| `navigator.onLine = false` or fetch fails with no connectivity | Offline banner: "You are offline — results may be unavailable or stale." |
| Online but server returns an error | Error banner with the server message |

The banner updates reactively — going online clears it, going offline shows it, without a page reload.

---

## JWT Secret Requirement

`JWT_SECRET` is **required** — the server will throw and refuse to start if it is absent. There is no insecure default fallback. Generate a strong secret before deployment:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set the output as `JWT_SECRET` in your `.env` file.

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
| `ADMINISTRATOR` | Full access to all internal modules (procurement, warehouse, knowledge base, admin); no access to the supplier-facing portal |
| `PROCUREMENT_MANAGER` | Procurement, approvals, suppliers, purchase orders, returns |
| `WAREHOUSE_CLERK` | Receiving, goods receipt, putaway; can submit low-stock alerts |
| `PLANT_CARE_SPECIALIST` | Knowledge base only |
| `SUPPLIER` | Supplier portal only — own POs and returns; cannot access any internal module |
