# Unified Test Coverage + README Audit (Strict Mode)

Static inspection only. No code/tests/scripts/containers/package managers/builds were executed.

Project type detection:
- README declaration present at top: `project-type: fullstack` (`repo/README.md:3`)
- Effective type: **fullstack**

---

## 1) Test Coverage Audit

### Backend Endpoint Inventory

Global prefix evidence:
- `app.setGlobalPrefix('api')` in `repo/server/src/main.ts:22`

Resolved endpoint inventory (controller decorators + global prefix): **100 endpoints**.

### API Test Mapping Table

Legend for `Type`:
- `true no-mock HTTP`
- `HTTP with mocking`
- `unit-only / indirect`
- `not covered`

| Endpoint | Covered | Type | Test files | Evidence |
|---|---|---|---|---|
| POST `/api/auth/login` | yes | true no-mock HTTP + HTTP with mocking | `repo/tests/e2e/login.spec.ts`; `repo/tests/server/auth/auth.integration.spec.ts` | E2E login flow; mocked auth integration suite |
| POST `/api/auth/refresh` | yes | HTTP with mocking | `repo/tests/server/auth/auth.integration.spec.ts` | `describe('POST /api/auth/refresh')` |
| POST `/api/auth/logout` | yes | true no-mock HTTP | `repo/tests/server/auth/auth-logout-change.integration.spec.ts` | `describe('POST /api/auth/logout')` |
| POST `/api/auth/change-password` | yes | true no-mock HTTP | `repo/tests/server/auth/auth-logout-change.integration.spec.ts` | `describe('POST /api/auth/change-password')` |
| GET `/api/admin/users` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix includes `/api/admin/users` |
| POST `/api/admin/users` | yes | true no-mock HTTP + HTTP with mocking | `repo/tests/e2e/procurement-lifecycle.spec.ts`; `repo/tests/server/admin/admin.integration.spec.ts` | E2E creates users; mocked admin integration |
| PATCH `/api/admin/users/:id` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| POST `/api/admin/users/:id/reset-password` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| GET `/api/catalog` | yes | true no-mock HTTP | `repo/tests/server/catalog/catalog.integration.spec.ts`; `repo/tests/server/catalog/catalog.pagination.spec.ts` | list + pagination tests |
| GET `/api/catalog/dropdown` | yes | true no-mock HTTP | `repo/tests/server/catalog/catalog.integration.spec.ts` | dropdown test |
| GET `/api/catalog/:id` | yes | true no-mock HTTP | `repo/tests/server/catalog/catalog.integration.spec.ts` | by-id test |
| POST `/api/catalog` | yes | true no-mock HTTP | `repo/tests/server/catalog/catalog.integration.spec.ts` | create tests |
| PATCH `/api/catalog/:id` | yes | true no-mock HTTP | `repo/tests/server/catalog/catalog.integration.spec.ts` | update tests |
| GET `/api/admin/duplicates` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| GET `/api/admin/duplicates/:id` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| POST `/api/admin/duplicates/:id/merge` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| POST `/api/admin/duplicates/:id/dismiss` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| GET `/api/admin/data-quality/issues` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| POST `/api/admin/data-quality/run-check` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| GET `/api/admin/data-quality/summary` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| GET `/api/health` | yes | true no-mock HTTP | `repo/tests/server/health/health.integration.spec.ts` | `describe('GET /api/health ...')` |
| GET `/api/articles` | yes | HTTP with mocking | `repo/tests/server/knowledge-base/kb-archived-visibility.integration.spec.ts` | `GET /api/articles` section uses mocked KB service |
| GET `/api/articles/slug/:slug` | yes | true no-mock HTTP | `repo/tests/server/knowledge-base/articles-slug.integration.spec.ts` | `describe('GET /api/articles/slug/:slug ...')` |
| GET `/api/articles/:id` | yes | true no-mock HTTP + HTTP with mocking | `repo/tests/e2e/kb-draft-visibility.spec.ts`; `repo/tests/server/knowledge-base/kb-archived-visibility.integration.spec.ts` | E2E ID lookup; mocked KB integration |
| POST `/api/articles` | yes | true no-mock HTTP | `repo/tests/e2e/kb-draft-visibility.spec.ts` | create draft article |
| PATCH `/api/articles/:id` | yes | HTTP with mocking | `repo/tests/server/knowledge-base/kb-archived-visibility.integration.spec.ts` | patch tests in mocked suite |
| PATCH `/api/articles/:id/promote` | yes | true no-mock HTTP | `repo/tests/e2e/kb-draft-visibility.spec.ts` | promote flow |
| GET `/api/articles/:id/versions` | yes | true no-mock HTTP | `repo/tests/server/knowledge-base/favorites-versions.integration.spec.ts` | versions list test |
| GET `/api/articles/:id/versions/:versionNumber` | yes | true no-mock HTTP | `repo/tests/server/knowledge-base/favorites-versions.integration.spec.ts` | version by number test |
| POST `/api/articles/:id/favorite` | yes | true no-mock HTTP | `repo/tests/server/knowledge-base/favorites-versions.integration.spec.ts` | favorite lifecycle |
| DELETE `/api/articles/:id/favorite` | yes | true no-mock HTTP | `repo/tests/server/knowledge-base/favorites-versions.integration.spec.ts` | delete favorite |
| GET `/api/articles/:id/favorite` | yes | true no-mock HTTP | `repo/tests/server/knowledge-base/favorites-versions.integration.spec.ts` | favorite status |
| GET `/api/users/me/favorites` | yes | true no-mock HTTP | `repo/tests/server/knowledge-base/favorites-versions.integration.spec.ts` | per-user favorites list |
| GET `/api/notifications` | yes | true no-mock HTTP | `repo/tests/server/notifications/notifications-reads.integration.spec.ts` | notifications list tests |
| GET `/api/notifications/unread-count` | yes | true no-mock HTTP | `repo/tests/server/notifications/notifications-reads.integration.spec.ts` | unread-count tests |
| PATCH `/api/notifications/read-all` | yes | true no-mock HTTP | `repo/tests/server/notifications/notifications-reads.integration.spec.ts` | read-all + DB assert |
| PATCH `/api/notifications/:id/read` | yes | HTTP with mocking | `repo/tests/server/notifications/notifications.integration.spec.ts` | mocked service integration |
| GET `/api/notifications/preferences` | yes | true no-mock HTTP | `repo/tests/server/notifications/notifications-reads.integration.spec.ts` | preferences test |
| PATCH `/api/notifications/preferences` | yes | HTTP with mocking | `repo/tests/server/notifications/notifications.integration.spec.ts` | mocked service integration |
| GET `/api/admin/logs` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| GET `/api/admin/jobs` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| POST `/api/admin/jobs/:id/retry` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| GET `/api/admin/system/stats` | yes | HTTP with mocking | `repo/tests/server/admin/admin.integration.spec.ts` | endpoint matrix |
| POST `/api/payments/callback` | yes | HTTP with mocking | `repo/tests/server/payments/payment-callback.spec.ts` | mocked connector + idempotency repo |
| GET `/api/procurement/requests` | yes | true no-mock HTTP | `repo/tests/server/procurement/procurement-reads.integration.spec.ts` | list endpoint tests |
| GET `/api/procurement/requests/approval-queue` | yes | true no-mock HTTP | `repo/tests/server/procurement/procurement-reads.integration.spec.ts` | approval queue tests |
| GET `/api/procurement/requests/:id` | yes | true no-mock HTTP | `repo/tests/server/procurement/procurement-reads.integration.spec.ts` | by-id tests |
| POST `/api/procurement/requests` | yes | true no-mock HTTP | `repo/tests/server/procurement/procurement-reads.integration.spec.ts`; `repo/tests/server/cross-module/procurement-flow.integration.spec.ts`; `repo/tests/e2e/procurement-lifecycle.spec.ts` | create PR tests |
| PATCH `/api/procurement/requests/:id` | yes | true no-mock HTTP | `repo/tests/server/procurement/procurement-reads.integration.spec.ts` | update test |
| POST `/api/procurement/requests/:id/submit` | yes | true no-mock HTTP | `repo/tests/server/cross-module/procurement-flow.integration.spec.ts`; `repo/tests/e2e/procurement-lifecycle.spec.ts` | submit flow |
| POST `/api/procurement/requests/:id/approve` | yes | true no-mock HTTP + HTTP with mocking | `repo/tests/e2e/procurement-lifecycle.spec.ts`; `repo/tests/server/procurement/procurement.integration.spec.ts` | E2E approval + mocked integration |
| POST `/api/procurement/requests/:id/cancel` | yes | true no-mock HTTP | `repo/tests/server/procurement/procurement-reads.integration.spec.ts` | cancel test |
| POST `/api/procurement/low-stock-alert` | yes | true no-mock HTTP | `repo/tests/server/procurement/procurement-reads.integration.spec.ts` | low-stock tests |
| GET `/api/purchase-orders` | yes | true no-mock HTTP | `repo/tests/server/purchase-orders/purchase-orders.integration.spec.ts`; `repo/tests/server/cross-module/procurement-flow.integration.spec.ts` | list tests |
| GET `/api/purchase-orders/:id` | yes | true no-mock HTTP | `repo/tests/server/purchase-orders/purchase-orders.integration.spec.ts`; `repo/tests/e2e/procurement-lifecycle.spec.ts` | by-id tests |
| PATCH `/api/purchase-orders/:id` | yes | true no-mock HTTP | `repo/tests/server/purchase-orders/purchase-orders.integration.spec.ts`; `repo/tests/server/purchase-orders/purchase-orders.edges.spec.ts` | patch tests |
| PATCH `/api/purchase-orders/:id/issue` | yes | true no-mock HTTP | `repo/tests/server/purchase-orders/purchase-orders.integration.spec.ts`; `repo/tests/e2e/procurement-dual-approval.spec.ts` | issue tests |
| PATCH `/api/purchase-orders/:id/cancel` | yes | true no-mock HTTP | `repo/tests/server/purchase-orders/purchase-orders.integration.spec.ts`; `repo/tests/server/cross-module/procurement-flow.integration.spec.ts` | cancel tests |
| GET `/api/supplier-portal/purchase-orders` | yes | true no-mock HTTP | `repo/tests/server/purchase-orders/purchase-orders.edges.spec.ts` | supplier PO list |
| GET `/api/supplier-portal/purchase-orders/:id` | yes | true no-mock HTTP | `repo/tests/server/purchase-orders/purchase-orders.edges.spec.ts` | supplier PO by-id |
| GET `/api/putaway-locations` | yes | true no-mock HTTP | `repo/tests/server/receiving/putaway-locations.integration.spec.ts` | list active tests |
| GET `/api/admin/putaway-locations` | yes | true no-mock HTTP | `repo/tests/server/receiving/putaway-locations.integration.spec.ts` | admin list tests |
| POST `/api/admin/putaway-locations` | yes | true no-mock HTTP | `repo/tests/server/receiving/putaway-locations.integration.spec.ts` | create tests |
| PATCH `/api/admin/putaway-locations/:id` | yes | true no-mock HTTP | `repo/tests/server/receiving/putaway-locations.integration.spec.ts` | patch tests |
| DELETE `/api/admin/putaway-locations/:id` | yes | true no-mock HTTP | `repo/tests/server/receiving/putaway-locations.integration.spec.ts` | delete tests |
| GET `/api/receipts` | yes | HTTP with mocking | `repo/tests/server/receiving/receiving.integration.spec.ts` | mocked receiving service |
| POST `/api/receipts` | yes | true no-mock HTTP + HTTP with mocking | `repo/tests/e2e/procurement-lifecycle.spec.ts`; `repo/tests/server/receiving/receiving.integration.spec.ts` | E2E receipt create |
| PATCH `/api/receipts/:id/complete` | yes | true no-mock HTTP + HTTP with mocking | `repo/tests/e2e/procurement-lifecycle.spec.ts`; `repo/tests/server/receiving/receiving.integration.spec.ts` | E2E completion |
| GET `/api/admin/return-policy` | yes | true no-mock HTTP | `repo/tests/server/returns/return-policy.integration.spec.ts` | GET policy tests |
| PATCH `/api/admin/return-policy` | yes | true no-mock HTTP | `repo/tests/server/returns/return-policy.integration.spec.ts` | PATCH policy tests |
| GET `/api/returns` | yes | true no-mock HTTP | `repo/tests/server/returns/returns-reads.integration.spec.ts` | list tests |
| GET `/api/returns/:id` | yes | true no-mock HTTP | `repo/tests/server/returns/returns-reads.integration.spec.ts` | by-id tests |
| POST `/api/returns` | yes | true no-mock HTTP + HTTP with mocking | `repo/tests/e2e/procurement-lifecycle.spec.ts`; `repo/tests/server/returns/returns.integration.spec.ts` | E2E create + mocked integration |
| PATCH `/api/returns/:id/submit` | yes | true no-mock HTTP | `repo/tests/e2e/procurement-lifecycle.spec.ts` | submit flow |
| PATCH `/api/returns/:id/status` | yes | HTTP with mocking | `repo/tests/server/returns/returns.integration.spec.ts` | mocked returns service |
| GET `/api/supplier-portal/returns` | yes | HTTP with mocking | `repo/tests/server/auth/auth.integration.spec.ts` | supplier portal returns auth tests |
| GET `/api/supplier-portal/returns/:id` | yes | HTTP with mocking | `repo/tests/server/auth/auth.integration.spec.ts` | supplier portal by-id auth tests |
| GET `/api/articles/search` | yes | true no-mock HTTP | `repo/tests/server/search/search.db.integration.spec.ts` | DB-backed search tests |
| GET `/api/articles/:id/similar` | yes | true no-mock HTTP | `repo/tests/server/search/search-similar-history.integration.spec.ts` | similar endpoint tests |
| GET `/api/users/me/search-history` | yes | true no-mock HTTP | `repo/tests/server/search/search-similar-history.integration.spec.ts` | history endpoint tests |
| GET `/api/admin/synonyms` | yes | true no-mock HTTP | `repo/tests/server/search/admin-synonyms.integration.spec.ts` | list tests |
| GET `/api/admin/synonyms/:id` | yes | true no-mock HTTP | `repo/tests/server/search/admin-synonyms.integration.spec.ts` | by-id tests |
| POST `/api/admin/synonyms` | yes | true no-mock HTTP | `repo/tests/server/search/admin-synonyms.integration.spec.ts` | create + duplicate conflict |
| PATCH `/api/admin/synonyms/:id` | yes | true no-mock HTTP | `repo/tests/server/search/admin-synonyms.integration.spec.ts` | patch tests |
| DELETE `/api/admin/synonyms/:id` | yes | true no-mock HTTP | `repo/tests/server/search/admin-synonyms.integration.spec.ts` | delete tests |
| GET `/api/suppliers` | yes | true no-mock HTTP | `repo/tests/server/suppliers/suppliers.integration.spec.ts`; `repo/tests/e2e/supplier-management.spec.ts` | list tests + UI flow |
| GET `/api/suppliers/dropdown` | yes | true no-mock HTTP | `repo/tests/server/suppliers/suppliers.integration.spec.ts` | dropdown tests |
| GET `/api/suppliers/:id` | yes | true no-mock HTTP | `repo/tests/server/suppliers/suppliers.integration.spec.ts` | by-id tests |
| POST `/api/suppliers` | yes | true no-mock HTTP | `repo/tests/server/suppliers/suppliers.integration.spec.ts`; `repo/tests/e2e/procurement-dual-approval.spec.ts` | create tests |
| PATCH `/api/suppliers/:id` | yes | true no-mock HTTP | `repo/tests/server/suppliers/suppliers.integration.spec.ts` | patch tests |
| GET `/api/supplier-portal/profile` | yes | true no-mock HTTP | `repo/tests/server/suppliers/supplier-portal-profile.integration.spec.ts` | profile tests |
| GET `/api/suppliers/:supplierId/ledger` | yes | true no-mock HTTP | `repo/tests/server/funds-ledger/funds-ledger.integration.spec.ts`; `repo/tests/server/funds-ledger/funds-ledger.invariants.spec.ts` | ledger read tests |
| POST `/api/suppliers/:supplierId/ledger/deposit` | yes | true no-mock HTTP | `repo/tests/server/funds-ledger/funds-ledger.integration.spec.ts`; `repo/tests/server/funds-ledger/funds-ledger.invariants.spec.ts` | deposit tests |
| POST `/api/suppliers/:supplierId/ledger/adjustment` | yes | true no-mock HTTP | `repo/tests/server/funds-ledger/funds-ledger.integration.spec.ts`; `repo/tests/server/funds-ledger/funds-ledger.invariants.spec.ts` | adjustment tests |
| POST `/api/suppliers/:supplierId/ledger/escrow-hold` | yes | true no-mock HTTP | `repo/tests/server/funds-ledger/funds-ledger.integration.spec.ts` | escrow hold tests |
| POST `/api/suppliers/:supplierId/ledger/escrow-release` | yes | true no-mock HTTP | `repo/tests/server/funds-ledger/funds-ledger.integration.spec.ts` | escrow release tests |
| POST `/api/suppliers/:supplierId/ledger/payment` | yes | true no-mock HTTP | `repo/tests/server/funds-ledger/funds-ledger.integration.spec.ts` | payment tests |
| POST `/api/suppliers/:supplierId/ledger/refund` | yes | true no-mock HTTP | `repo/tests/server/funds-ledger/funds-ledger.integration.spec.ts` | refund tests |

### API Test Classification

1. **True No-Mock HTTP**
- `repo/tests/server/auth/auth-logout-change.integration.spec.ts`
- `repo/tests/server/catalog/catalog.integration.spec.ts`
- `repo/tests/server/catalog/catalog.pagination.spec.ts`
- `repo/tests/server/cross-module/procurement-flow.integration.spec.ts`
- `repo/tests/server/funds-ledger/funds-ledger.integration.spec.ts`
- `repo/tests/server/funds-ledger/funds-ledger.invariants.spec.ts`
- `repo/tests/server/health/health.integration.spec.ts`
- `repo/tests/server/knowledge-base/articles-slug.integration.spec.ts`
- `repo/tests/server/knowledge-base/favorites-versions.integration.spec.ts`
- `repo/tests/server/notifications/notifications-reads.integration.spec.ts`
- `repo/tests/server/procurement/procurement-reads.integration.spec.ts`
- `repo/tests/server/purchase-orders/purchase-orders.integration.spec.ts`
- `repo/tests/server/purchase-orders/purchase-orders.edges.spec.ts`
- `repo/tests/server/receiving/putaway-locations.integration.spec.ts`
- `repo/tests/server/returns/return-policy.integration.spec.ts`
- `repo/tests/server/returns/returns-reads.integration.spec.ts`
- `repo/tests/server/search/search.db.integration.spec.ts`
- `repo/tests/server/search/search-similar-history.integration.spec.ts`
- `repo/tests/server/search/admin-synonyms.integration.spec.ts`
- `repo/tests/server/suppliers/suppliers.integration.spec.ts`
- `repo/tests/server/suppliers/supplier-portal-profile.integration.spec.ts`
- E2E boundary tests: `repo/tests/e2e/login.spec.ts`, `repo/tests/e2e/procurement-lifecycle.spec.ts`, `repo/tests/e2e/procurement-dual-approval.spec.ts`, `repo/tests/e2e/kb-draft-visibility.spec.ts`, `repo/tests/e2e/supplier-management.spec.ts`

2. **HTTP with Mocking**
- `repo/tests/server/admin/admin.integration.spec.ts`
- `repo/tests/server/auth/auth.integration.spec.ts`
- `repo/tests/server/knowledge-base/kb-archived-visibility.integration.spec.ts`
- `repo/tests/server/notifications/notifications.integration.spec.ts`
- `repo/tests/server/payments/payment-callback.spec.ts`
- `repo/tests/server/procurement/procurement.integration.spec.ts`
- `repo/tests/server/receiving/receiving.integration.spec.ts`
- `repo/tests/server/returns/returns.integration.spec.ts`
- `repo/tests/server/search/search.integration.spec.ts`

3. **Non-HTTP (unit/integration without HTTP)**
- `repo/tests/server/auth/auth.service.spec.ts`
- `repo/tests/server/auth/auth-guards.spec.ts`
- `repo/tests/server/bootstrap/bootstrap.service.spec.ts`
- `repo/tests/server/budget/budget.service.spec.ts`
- `repo/tests/server/data-quality/data-quality.service.spec.ts`
- `repo/tests/server/notifications/notification.service.spec.ts`
- `repo/tests/server/observability/scheduler.service.spec.ts`
- `repo/tests/server/procurement/procurement.service.spec.ts`
- `repo/tests/server/receiving/receiving.service.spec.ts`
- `repo/tests/server/returns/returns.service.spec.ts`
- `repo/tests/server/search/search.service.spec.ts`
- `repo/tests/server/search/search.unit.spec.ts`
- `repo/tests/server/suppliers/supplier-portal.controller.spec.ts`

### Mock Detection Rules (evidence)

- `repo/tests/server/admin/admin.integration.spec.ts`: DI `useValue` providers for admin/data-quality/observability services (mocked execution path)
- `repo/tests/server/auth/auth.integration.spec.ts`: mocked auth/services/repos via DI `useValue`
- `repo/tests/server/procurement/procurement.integration.spec.ts`: mocked `ProcurementService`
- `repo/tests/server/receiving/receiving.integration.spec.ts`: mocked `ReceivingService`
- `repo/tests/server/returns/returns.integration.spec.ts`: mocked `ReturnsService`
- `repo/tests/server/notifications/notifications.integration.spec.ts`: mocked `NotificationService`
- `repo/tests/server/search/search.integration.spec.ts`: mocked `SearchService`
- `repo/tests/server/knowledge-base/kb-archived-visibility.integration.spec.ts`: mocked `KnowledgeBaseService`
- `repo/tests/server/payments/payment-callback.spec.ts`: mocked `PAYMENT_CONNECTOR` and mocked idempotency repository token
- `repo/tests/server/suppliers/supplier-portal.controller.spec.ts`: direct controller invocation (`controller.getProfile`) bypasses HTTP transport

### Coverage Summary

- Total endpoints: **100**
- Endpoints with HTTP tests: **100**
- Endpoints with true no-mock HTTP tests: **76**

Computed:
- HTTP coverage: **100.00%**
- True API coverage: **76.00%**

### Unit Test Summary

Backend unit tests (evidence examples):
- Controllers: `repo/tests/server/suppliers/supplier-portal.controller.spec.ts`
- Services: `repo/tests/server/*/*.service.spec.ts` (auth, procurement, receiving, returns, notifications, search, budget, bootstrap, data-quality, scheduler)
- Auth/guards/middleware: `repo/tests/server/auth/auth-guards.spec.ts`
- Repositories: mostly exercised through DI mocks in unit tests and directly via DB assertions in no-mock integration suites.

Important backend modules/endpoints still relatively weaker (mock-heavy despite HTTP coverage):
- Admin/data-quality/observability routes (`repo/tests/server/admin/admin.integration.spec.ts`) are primarily mocked service-path tests
- Payment callback route uses mocked connector and idempotency repo (`repo/tests/server/payments/payment-callback.spec.ts`)
- Some notifications/returns/receiving endpoints still have only mocked HTTP integration for portions of behavior

Frontend unit tests (strict requirement):
- Files detected: `repo/tests/client/Login.test.tsx`, `repo/tests/client/auth.test.tsx`, `repo/tests/client/ProtectedRoute.test.tsx`, `repo/tests/client/ArticleRoutes.test.tsx`, `repo/tests/client/SupplierPortalRoutes.test.tsx`, `repo/tests/client/SupplierPortalSmoke.test.tsx`, `repo/tests/client/ReceivingForm.test.tsx`, `repo/tests/client/OfflineUX.test.tsx`, `repo/tests/client/sw-cache.test.ts`, `repo/tests/client/sw-offline-queue.test.ts`
- Framework evidence:
  - Vitest config: `repo/client/vitest.config.ts`
  - React Testing Library + component rendering imports: `repo/tests/client/Login.test.tsx` (imports `@testing-library/react`, `../../client/src/pages/Login`, `AuthContext`)
- Covered frontend modules/components:
  - Auth flow/context, login navigation, route guards, supplier portal route protections, receiving form behavior, offline UX/SW behavior.
- Important frontend modules/pages not clearly tested:
  - Many pages under `repo/client/src/pages` (e.g., `AdminUsers.tsx`, `DataQualityDashboard.tsx`, `ObservabilityDashboard.tsx`, `ReturnPolicy.tsx`, `SynonymManager.tsx`)
  - Shared layout/navigation components (`repo/client/src/components/Layout.tsx`, `Sidebar.tsx`, `TopNav.tsx`, `NotificationBell.tsx`)

**Frontend unit tests: PRESENT**

Cross-layer observation:
- Backend API coverage is broader than frontend component coverage, but frontend tests are materially present and non-trivial.

### API Observability Check

Strong observability examples:
- `repo/tests/server/auth/auth-logout-change.integration.spec.ts` (request + cookie/session state + DB assertions)
- `repo/tests/server/returns/returns-reads.integration.spec.ts` (request filters + payload + relation assertions)
- `repo/tests/server/search/search-similar-history.integration.spec.ts` (caller scoping and payload semantics)
- `repo/tests/server/procurement/procurement-reads.integration.spec.ts` (specific statuses/messages and audit side effects)

Weak areas:
- Some legacy mocked integration suites remain guard/wiring focused (limited business-path observability) in `repo/tests/server/admin/admin.integration.spec.ts`, `repo/tests/server/procurement/procurement.integration.spec.ts`, `repo/tests/server/receiving/receiving.integration.spec.ts`, `repo/tests/server/returns/returns.integration.spec.ts`.

### Tests Check

- Appropriate test categories for this fullstack project are present: API/integration, backend unit, frontend unit/component, and E2E.
- `run_tests.sh` is Docker-based and executes backend/frontend/E2E in containers (`repo/run_tests.sh`), no host Node/Python dependency for main flow.
- Coverage breadth is now high (all endpoints have HTTP tests). Sufficiency is strong but not maximal due to remaining mock-heavy API zones and skipped SW E2E cases.

### Test Coverage Score (0–100)

**93 / 100**

### Score Rationale

- Breadth is excellent: endpoint HTTP coverage is complete.
- Depth improved significantly: many critical paths are true no-mock, DB-backed, and assert behavior beyond status codes.
- Score reduced for mock-heavy admin/observability/payment and skipped SW lifecycle E2E cases.

### Key Gaps

- Mock-heavy API areas still limit confidence at core boundaries:
  - admin/data-quality/observability integration suite (`repo/tests/server/admin/admin.integration.spec.ts`)
  - payment callback still mocks connector/repository (`repo/tests/server/payments/payment-callback.spec.ts`)
- SW browser lifecycle E2E still contains multiple skipped tests (`repo/tests/e2e/sw-lifecycle.spec.ts`: `test.skip(...)` cases around cache/offline queue).

### Confidence & Assumptions

- Confidence: **high** for endpoint inventory and test classification from static evidence.
- Assumptions: endpoint resolution uses controller decorators + global `/api` prefix; no hidden runtime route registration beyond inspected code.

---

## 2) README Audit

Target file exists:
- `repo/README.md`

### High Priority Issues

- None.

### Medium Priority Issues

- README remains long and operationally dense; onboarding could be faster with a shorter quick-reference section.

### Low Priority Issues

- `repo/README.md` still documents both Compose syntaxes (`docker compose` and `docker-compose`) for compatibility. This is acceptable for strict audit but can be simplified later if legacy support is no longer needed.

### Hard Gate Failures

- None.

All other hard gates:
- Formatting/readability: PASS
- Startup instructions (strict literal + modern syntax): PASS (`repo/README.md:33-36` includes both `docker compose up --build` and `docker-compose up`)
- Access method (URL + port): PASS (`repo/README.md:44-48`)
- Verification method: PASS (`repo/README.md:86-108`)
- Environment rules (no `npm install`/`pip install`/`apt-get`/manual DB setup): PASS
- Demo credentials (auth present + roles): PASS (`repo/README.md:80-84`, `repo/README.md:309-317`)

### README Verdict (PASS / PARTIAL PASS / FAIL)

**PASS**
