# GreenLeaf Operations Suite

project-type: fullstack

A fullstack procurement, warehouse, and plant-care knowledge management
system built with NestJS + TypeORM (backend) and React + Vite (frontend).

Everything below — startup, database, migrations, first login, and the full
test suite — runs inside Docker Compose containers. **The canonical path
requires only Docker with the Compose v2 plugin on the host**; no Node, npm,
pip, apt-get, or Postgres install is needed, and no manual database setup is
performed by the operator.

---

## Prerequisites

| Tool | Required for |
|------|-------------|
| **Docker + Compose v2 plugin** | The only host requirement. Runs the app stack and the full test suite. |
| Git | Cloning the repo. |

No Node, npm, pip, apt-get, or host PostgreSQL is required — every
command in this README is either `curl`, `docker compose ...`, or runs
inside a container via `docker compose exec`.

---

## Quick Start (Docker-first, canonical)

```bash
# From repo/ — recommended (Docker Compose v2 plugin)
docker compose up --build

# Compatible legacy syntax (standalone docker-compose v1 binary)
docker-compose up
```

Both commands bring up the exact same stack (`db`, `api`, `web`). Use
`docker compose up --build` if you have the Compose v2 plugin (shipped with
Docker Desktop and modern Docker Engine); fall back to `docker-compose up`
only if you are on a host that still ships the legacy v1 binary.

| Service | Published URL |
|---------|--------------|
| Web UI  | http://localhost:3000 |
| API     | http://localhost:3001/api |
| Postgres | localhost:5432 (published for debugging only) |

What this does automatically (no manual steps):

1. Brings up the `db` service on Postgres 16, creates the `greenleaf`
   role + `greenleaf_db` database, and enables the `pg_trgm` extension via
   the migration scripts.
2. Starts the `api` service (NestJS). TypeORM migrations run on boot
   (`migrationsRun: true` in `server/src/config/typeorm.config.ts`), so
   the schema, seeded enums, and the admin-bootstrap user are all applied
   automatically.
3. Starts the `web` service (Vite) which proxies `/api/*` to `http://api:3001`
   on the internal Compose network (`VITE_API_URL` in `docker-compose.yml`).

No `CREATE USER`, `npm install`, or host Postgres setup is required. A
second `docker compose up` reuses the same Postgres volume and preserves
all data.

### Environment variables

All defaults live in `docker-compose.yml`. To override them without editing
the file, create `repo/.env` — Docker Compose picks it up automatically.
**The canonical path does not require a `.env` file** because the compose
file provides safe defaults for every variable (e.g.
`ADMIN_BOOTSTRAP_PASSWORD: ${ADMIN_BOOTSTRAP_PASSWORD:-change-me}`).

See *Key Environment Variables Reference* further down for the full list.

---

## First-Login Bootstrap

1. `docker compose up --build` — the migration seeds the admin user with
   the password set by `ADMIN_BOOTSTRAP_PASSWORD` (default: `change-me`).
2. Open http://localhost:3000 and log in with:
   - **Username:** `admin`
   - **Password:** `change-me` (or whatever you set in the env var)
3. The UI redirects to a forced password-change screen. Set a strong
   password. After saving, you land on the role-appropriate dashboard.

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

`bash repo/run_tests.sh` is the canonical full-suite path. It runs every
suite inside a Docker container — **the only host requirement is Docker +
the Compose v2 plugin**. No Node, npm, or PostgreSQL needs to be installed
locally.

```bash
# From the directory that contains repo/
bash repo/run_tests.sh
```

The script runs three phases and exits `0` only if all three pass:

1. **Backend — Jest unit + integration tests** in the `api` container. Covers
   domain services, controllers, and real-DB integration suites (TypeORM +
   `supertest`) against the `db` service.
2. **Frontend — Vitest component tests** in the `web` container (`--no-deps`,
   no DB needed).
3. **End-to-end — Playwright** in the `e2e` container (Chromium, real
   browser → Vite proxy → NestJS → Postgres). See the section below for
   details.

The DB service is brought up and health-checked before phase 1; `api` +
`web` are brought up and the demo seed is run before phase 3.

### Testing mode

There is exactly one supported mode:

| Mode | Command |
|------|---------|
| Canonical (Docker-only, CI-aligned) | `bash repo/run_tests.sh` |

Backend, frontend, and E2E all run inside their respective compose services
(`api`, `web`, `e2e`). No host runtime is invoked at any point.

### End-to-End tests (Playwright, Docker-only)

The `e2e` Compose service — built from `e2e.Dockerfile` — is based on
`mcr.microsoft.com/playwright` and runs Chromium inside the container. It
joins the shared Compose network and talks to the already-running `web`
and `api` services. `run_tests.sh` brings up `api` + `web`, runs the demo
seed via `docker compose exec api npm run seed:demo`, and then invokes the
`e2e` service via `docker compose run --rm`.

Service-worker browser-level tests (`tests/e2e/sw-lifecycle.spec.ts`) are
skipped in the Docker runner. SW registration requires a secure origin
(HTTPS or `localhost`) and the Docker flow talks to the app over the
plain-HTTP Compose DNS name `web:3000`. Instead, the SW logic is
exhaustively covered by the dedicated Vitest unit suites at
`tests/client/sw-cache.test.ts` and `tests/client/sw-offline-queue.test.ts`,
which drive the real `public/sw.js` fetch handler and the IndexedDB
offline queue without a browser. The E2E image ships no extra OS
packages (no `apt-get`), so the build does not depend on Ubuntu mirrors.

`playwright.config.docker.ts` is the config used inside the container. It
does **not** start its own webServer (the `api` and `web` containers are
already running) and takes `baseURL` from `E2E_BASE_URL`
(`http://web:3000` by default).

Env vars consumed by the E2E runner (all have defaults in
`docker-compose.yml`):

| Variable | Default | Used by |
|----------|---------|---------|
| `E2E_BASE_URL` | `http://web:3000` | Playwright `baseURL` in Docker |
| `E2E_API_URL` | `http://api:3001` | API-only E2E specs that call the backend directly |
| `E2E_ADMIN_USER` | `demo_admin` | UI login specs |
| `E2E_ADMIN_PASS` | `Demo1234!` | UI login specs |
| `AUTH_LOGIN_THROTTLE_LIMIT` | `1000` | Relaxed throttle so repeat E2E runs don't 429 |

Override any of these by adding them to `repo/.env` before running
`bash repo/run_tests.sh`. There is no host-side Playwright execution path.

---

## Project Structure

```
repo/
├── docker-compose.yml           Full-stack service definitions (db, api, web, e2e)
├── run_tests.sh                 Canonical test runner — Docker-only, drives all 3 suites
├── e2e.Dockerfile               Playwright runner image (Chromium)
├── playwright.config.docker.ts  Playwright config used inside the e2e container
├── package.json                 E2E runner deps (@playwright/test), installed into the e2e image
├── server/                      NestJS API
│   ├── src/
│   │   ├── auth/                JWT + session auth, change-password
│   │   ├── bootstrap/           Startup admin-existence check
│   │   ├── procurement/         Purchase requests, approvals, low-stock alerts
│   │   ├── purchase-orders/
│   │   ├── receiving/           Goods receiving, putaway locations
│   │   ├── returns/             Return authorizations, restocking fee engine
│   │   ├── suppliers/           Supplier CRUD + portal
│   │   ├── funds-ledger/
│   │   ├── knowledge-base/      Articles, versioning, favorites
│   │   ├── search/              Full-text search, synonyms
│   │   ├── notifications/       In-app notification center
│   │   ├── budget/              Budget cap enforcement + authorized overrides
│   │   ├── data-quality/        Deduplication, quality checks
│   │   ├── observability/       Structured logs, job metrics, system stats
│   │   ├── seeds/               Non-production demo seed (see *Seed / Demo Data*)
│   │   └── migrations/          Sequential DB migrations
│   └── package.json
├── tests/
│   ├── server/                  Jest — unit + real-DB integration (per-module + cross-module)
│   ├── client/                  Vitest — component + service-worker unit tests
│   └── e2e/                     Playwright — browser + API E2E specs
└── client/                      React + Vite SPA
    ├── public/sw.js             User-scoped offline KB cache (service worker)
    ├── src/
    │   ├── api/                 Typed fetch wrappers per domain
    │   ├── components/          Layout, Sidebar, TopNav, NotificationBell
    │   ├── contexts/            AuthContext (login/logout/SW cache lifecycle)
    │   └── pages/               One component per route
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
| `JWT_SECRET` | `change-me-to-a-random-secret` (compose default) | JWT signing secret. Replace before any production deployment. |
| `SESSION_TIMEOUT_MINUTES` | `30` | Sliding session window |
| `API_PORT` | `3001` | Backend listen port (also the published Compose port) |
| `WEB_PORT` | `3000` | Frontend listen port (Vite dev server, published by Compose) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin (read by `server/src/main.ts`) |
| `ADMIN_BOOTSTRAP_USERNAME` | `admin` | Initial admin username (one-time) |
| `ADMIN_BOOTSTRAP_PASSWORD` | `change-me` | Initial admin password (one-time) |
| `AUTH_LOGIN_THROTTLE_LIMIT` | `1000` in Compose, `10` when unset | Login attempts per 15 minutes before 429 |
| `FIELD_ENCRYPTION_KEY` | `change-me-to-a-random-32-char-key` (compose default) | 32-byte hex key for AES-256-GCM encryption of supplier `bankingNotes` and `internalRiskFlag` fields. Replace before any production deployment. |
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

## Seed / Demo Data (optional)

A non-production seed creates one user per role plus minimal linked data for
a demo walk-through. The seed is optional — it is **not required** for the
canonical Docker startup above (which already provisions the admin bootstrap
user automatically). `bash repo/run_tests.sh` also runs this seed itself
before the E2E phase.

Run it inside the `api` container (no host Node install needed):

```bash
# With `docker compose up` already running in another shell:
docker compose exec api npm run seed:demo
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

For **local Docker runs** the compose file supplies a safe default
(`JWT_SECRET: ${JWT_SECRET:-change-me-to-a-random-secret}`) so the stack
starts out of the box. **Before any production deployment** replace it with
a strong, random value and set it as `JWT_SECRET` in your deployment secret
store (or `repo/.env` for local overrides).

Generate a strong secret without a local Node install:

```bash
# Canonical — uses the already-running api container
docker compose exec api node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# If the stack is stopped, run it one-shot in a throwaway container
docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

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
