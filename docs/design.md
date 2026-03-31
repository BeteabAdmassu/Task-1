# Design Document — GreenLeaf Operations Suite

## Architecture

The system is a monorepo with two independently deployable sub-projects:

```
repo/
├── server/   NestJS REST API (port 3001)
└── client/   React SPA (port 5173 in dev, served as static assets in prod)
```

All communication is JSON over HTTP. The client authenticates via Bearer JWT for every request; the refresh token travels only as an HttpOnly cookie and is never exposed in response bodies.

### Request lifecycle

```
Client → ThrottlerGuard (200 req/60s) → JwtAuthGuard → RolesGuard → Controller → Service → TypeORM → PostgreSQL 16
```

Global guards are registered on `APP_GUARD` in `AppModule`, so every route is protected by default. Routes that must be public (health check, login, payment callback) carry the `@Public()` decorator which causes `JwtAuthGuard` to skip JWT validation for that route.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Node.js 20 | |
| API framework | NestJS 10 | Modular DI, decorators |
| ORM | TypeORM 0.3.x | Repository pattern; raw `QueryRunner` for migrations and seed |
| Database | PostgreSQL 16 | UUID PKs (`gen_random_uuid()`), advisory locks, enums, tsvector |
| Auth | Passport.js + `@nestjs/jwt` | JWT strategy; refresh token rotation |
| Encryption | AES-256-GCM | `FIELD_ENCRYPTION_KEY` env var; used for `bankingNotes` and `internalRiskFlag` supplier fields |
| Rate limiting | `@nestjs/throttler` | Global: 200/60s; Login: 10/15min |
| Frontend | React 18 + Vite | TypeScript, React Router v6 |
| Offline cache | Service Worker | Cache-first KB pages per user; cleared on logout |
| Testing (server) | Jest + Supertest | Integration tests with real `INestApplication` |
| Testing (client) | Vitest + React Testing Library | Component and hook tests |

---

## Module Structure (server)

Each NestJS module encapsulates one bounded context. Cross-cutting concerns are in `common/`.

| Module | Responsibility |
|--------|---------------|
| `AuthModule` | Login, logout, token refresh, password change; session table management |
| `UsersModule` | User profile; favorites; search history |
| `AdminModule` | User CRUD, putaway location CRUD, synonym CRUD |
| `SuppliersModule` | Supplier records with encrypted sensitive fields; budget cap column |
| `ProcurementModule` | Purchase requests, approval workflow, low-stock alert ingest |
| `PurchaseOrdersModule` | PO lifecycle (DRAFT → ISSUED → received/cancelled); budget enforcement on issue |
| `BudgetModule` | Budget cap checks, advisory-lock serialization, override recording, audit |
| `ReceivingModule` | Receipts, putaway locations |
| `ReturnsModule` | Return authorizations, return policy |
| `FundsLedgerModule` | Deposit and adjustment entries; per-supplier advisory-lock serialization |
| `KnowledgeBaseModule` | Articles, versioning, full-text search, favorites |
| `SearchModule` | Synonym groups; synonym-expansion for KB search |
| `NotificationsModule` | Per-user notifications, read state, preferences |
| `DataQualityModule` | Duplicate detection, quality issue reporting |
| `ObservabilityModule` | Structured logs, background job metrics, system stats |
| `PaymentsModule` | Payment connector interface; callback controller with idempotency |
| `AuditModule` | `audit_logs` writer; imported by any module that needs an audit trail |
| `BootstrapModule` | One-time startup checks (e.g. admin user existence) |
| `HealthModule` | `GET /api/health` liveness probe |

---

## Database Schema

18 migrations in `src/migrations/` run in timestamp order. Key tables:

### Identity & access

| Table | Purpose |
|-------|---------|
| `users` | One row per staff member or supplier account. Columns: `id`, `username`, `passwordHash`, `role` (enum), `isActive`, `supplierId` (FK, supplier accounts only), `mustChangePassword`, `createdAt`, `updatedAt` |
| `sessions` | Refresh token store. Each login creates a row; logout deletes it; `changePassword` deletes all other rows. Columns: `id`, `userId` (FK → users, CASCADE DELETE), `refreshToken`, `expiresAt`, `lastActivityAt`, `createdAt` |
| `audit_logs` | Immutable append-only log of every mutating action. Columns: `id`, `userId`, `action` (enum), `entityType`, `entityId`, `before` (JSONB), `after` (JSONB), `createdAt` |

### Procurement

| Table | Purpose |
|-------|---------|
| `suppliers` | Supplier master data including `budgetCap DECIMAL(14,2) NULL` added in migration 17 |
| `purchase_requests` | With `requestNumber` (from sequence `pr_number_seq`), `approvalTier` (0/1/2), `totalAmount`, `status` enum |
| `purchase_request_line_items` | Line items linked to a request |
| `approval_steps` | One row per approval action against a request |
| `purchase_orders` | Derived from approved requests; `poNumber` (from `po_number_seq`); `status` enum |
| `purchase_order_line_items` | Line items with `quantityReceived` counter |
| `budget_overrides` | Records every ADM-authorized budget-cap override with `overrideAmount`, `availableAtTime`, `reason` |

### Receiving & returns

| Table | Purpose |
|-------|---------|
| `receipts` | Inbound receiving events against a PO |
| `receipt_line_items` | Per-line quantities with variance reason codes |
| `putaway_locations` | Warehouse zones/shelves; admin-managed |
| `returns` | Return authorization headers |
| `return_line_items` | Per-line quantities and condition |
| `return_policy` | Single-row configuration (windowDays, restockingFeePercent, requiresApproval) |

### Finance & knowledge

| Table | Purpose |
|-------|---------|
| `funds_ledger_entries` | Immutable deposit/adjustment entries per supplier |
| `articles` | KB articles with `slug` (UNIQUE NOT NULL), `status` enum, `tsvector` column updated by trigger |
| `article_versions` | Snapshot on every PATCH |
| `search_synonyms` | Synonym groups for query expansion |
| `notifications` | Per-user notification rows with `recipientId`, `type` enum, `isRead` |
| `notification_preferences` | Per-user toggle map for notification types |

### Payments

| Table | Purpose |
|-------|---------|
| `payment_idempotency_keys` | Stores `key`, `connectorName`, `operation`, `result` (JSONB); prevents duplicate webhook processing |

### Data quality & observability

| Table | Purpose |
|-------|---------|
| `duplicate_candidates` | Entity pairs flagged for review |
| `data_quality_issues` | Last quality check results |
| `job_runs` | Background job execution history |
| `system_logs` | Structured application logs |

---

## Authentication & Session Design

### Token flow

1. `POST /auth/login` → validates credentials → creates session row → returns `{ accessToken, user }` + `Set-Cookie: refresh_token` (HttpOnly, SameSite=Strict, Secure in prod).
2. Access token is short-lived (15 min). When it expires the client calls `POST /auth/refresh` with the cookie.
3. `/auth/refresh` reads the cookie, validates the token, **deletes the old session row**, creates a new one, and returns a new `{ accessToken, user }` + a new `Set-Cookie`. The `refreshToken` value itself is never returned in the JSON body.
4. `POST /auth/logout` deletes the session row and clears the cookie.
5. `POST /auth/change-password` rehashes the password, deletes all sessions *except* the one matching the current refresh token, and returns `{ message }`. The user stays logged in on the current device.

### Guard chain

`JwtAuthGuard` (Passport JWT strategy) runs first; it sets `req.user`. `RolesGuard` reads the `@Roles(...)` decorator metadata and compares against `req.user.role`. Routes marked `@Public()` are skipped by both guards.

---

## Budget Cap Enforcement

Budget cap is stored as `suppliers.budgetCap` (nullable decimal). "Committed" is computed on demand as the sum of `totalAmount` across POs in status `ISSUED`, `PARTIALLY_RECEIVED`, or `FULLY_RECEIVED` for that supplier.

### Issue flow

```
PATCH /purchase-orders/:id/issue
  └─ PurchaseOrdersService.issue()
       └─ EntityManager transaction
            ├─ SELECT pg_advisory_xact_lock(hashtext('budget-{supplierId}'))
            ├─ BudgetService.checkAndEnforce()
            │    ├─ no cap → { allowed: true }
            │    └─ cap set → query committed → return { allowed, cap, committed, available }
            ├─ allowed=false AND no override → throw 400 (cap/committed/available in message)
            ├─ allowed=false AND override=true AND role≠ADM → throw 403
            ├─ allowed=false AND override=true AND role=ADM
            │    └─ BudgetService.recordOverride() → saves budget_overrides + audit log
            └─ update PO status to ISSUED
```

The advisory lock is acquired inside the transaction and held until commit, serializing concurrent issue requests for the same supplier. The lock key is `hashtext('budget-{supplierId}')` — the same pattern used in `FundsLedgerService`.

---

## Payment Connector Pattern

A pluggable connector interface (`IPaymentConnector`) is injected via the `PAYMENT_CONNECTOR` DI token. The default implementation is `NoopPaymentConnector` which accepts all callbacks (`verifyCallback` always returns `true`). Real connectors (Stripe, etc.) would implement HMAC or JWT signature verification.

The callback endpoint is guarded by `PAYMENTS_ENABLED=true` env var to prevent the permissive noop connector from silently accepting webhooks in offline or CI environments. When the guard trips it returns `503` with a message naming the missing variable. Idempotency is enforced by storing each processed `key` in `payment_idempotency_keys`; a duplicate key returns the stored result without side effects.

---

## Service Worker Offline Cache

The client registers a service worker that caches Knowledge Base article responses. The cache key is `greenleaf-kb-v2-<userId>` so per-user caches are isolated. On logout the client posts a `CLEAR_CACHE` message to the service worker which purges the cache. Articles are served cache-first; a network failure falls back to cache transparently. Non-KB routes are network-only.

Components that fetch data (`SearchResults`, `NotificationsList`, etc.) check `navigator.onLine` in their fetch error handler and display an `offline-banner` rather than a generic error message when the device is disconnected.

---

## Background Jobs

Observability endpoints expose background job run history via `job_runs` and allow admin-triggered retries via `POST /admin/jobs/:id/retry`. Job metrics are visible at `GET /admin/jobs` and system queue stats at `GET /admin/system/stats`.

---

## Field Encryption

`bankingNotes` and `internalRiskFlag` on the `Supplier` entity are encrypted at rest using AES-256-GCM. The key is read from `FIELD_ENCRYPTION_KEY` (32-byte hex string). These fields are also restricted to `ADM` in API responses — `PM` callers receive the supplier record with those fields omitted.
