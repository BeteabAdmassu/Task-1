# GreenLeaf Operations Suite - Static Audit Report (Iteration 2)

## 1. Verdict
- **Partial Pass**

## 2. Scope and Verification Boundary
- Reviewed: `repo/README.md`, root/client/server package manifests, route wiring, auth/role guards, core domain modules (procurement, PO, receiving, returns, KB, search, notifications, data-quality, observability), frontend pages/components/state/api layers, and test suites (`repo/client/src/__tests__`, `repo/server/src/**/*.spec.ts`, `repo/tests/e2e`).
- Excluded from evidence: `./.tmp/**` (except writing this report file).
- Not executed: app runtime, tests, Docker/Compose, browser flows, DB/network integrations.
- Cannot statically confirm: runtime replay timing/behavior in real browsers and network conditions, visual rendering fidelity, production deployment hardening.
- Manual verification required: offline mutation replay under real connectivity transitions; dashboard behavior for multi-attempt background jobs.

## 3. Prompt / Repository Mapping Summary
- Prompt core goals mapped: role-based local auth, procurement lifecycle (request -> approvals -> PO -> receiving -> returns), supplier portal, KB versioning/phased visibility/favorites/search/synonyms/similar/history, notifications with preferences/read receipts/throttle, dedup+mapping, data-quality jobs, observability dashboard, local-first/offline behavior.
- Reviewed implementation areas: `repo/client/src/App.tsx:57`, `repo/server/src/app.module.ts:30`, `repo/server/src/procurement/procurement.service.ts:181`, `repo/server/src/returns/returns.service.ts:76`, `repo/server/src/search/search.service.ts:92`, `repo/server/src/notifications/notification.service.ts:33`, `repo/client/public/sw.js:161`.

## 4. High / Blocker Coverage Panel
- **A. Prompt-fit / completeness blockers:** **Partial Pass** - Core modules/flows exist, but offline-first closure for queued mutations has a material static gap (F-01). Evidence: `repo/client/public/sw.js:206`, `repo/client/public/sw.js:213`, `repo/client/src/main.tsx:8`.
- **B. Static delivery / structure blockers:** **Pass** - Startup/build/test/docs and entry points are statically coherent. Evidence: `repo/README.md:90`, `repo/client/package.json:7`, `repo/server/package.json:6`.
- **C. Frontend-controllable interaction / state blockers:** **Partial Pass** - Most loading/error/submitting states exist, but offline queue replay trigger is not wired from app layer (F-01). Evidence: `repo/client/src/pages/ReceivingForm.tsx:165`, `repo/client/src/pages/Login.tsx:63`, `repo/client/public/sw.js:206`.
- **D. Data exposure / delivery-risk blockers:** **Pass** - No real secrets/keys hardcoded in app code; sensitive supplier fields are encrypted/masked by role. Evidence: `repo/server/src/suppliers/supplier.entity.ts:37`, `repo/server/src/suppliers/suppliers.controller.ts:10`, `repo/.env.example:13`.
- **E. Test-critical gaps:** **Partial Pass** - Broad test suite exists, but no browser-level test proves queued offline mutations auto-replay after reconnect (F-01 remains high-risk). Evidence: `repo/tests/e2e/sw-lifecycle.spec.ts:174`, `repo/client/src/__tests__/sw-offline-queue.test.ts:127`.

## 5. Confirmed Blocker / High Findings

### F-01
- **Severity:** High
- **Conclusion:** Offline mutation queue replay is not deterministically triggered by the application layer.
- **Brief rationale:** SW supports replay via `SYNC_QUEUE` message, but frontend code never sends that message; replay depends on SW global `online` event path only, leaving core offline write closure at risk.
- **Evidence:** `repo/client/public/sw.js:206`, `repo/client/public/sw.js:213`, `repo/client/src/main.tsx:8`, `repo/client/src/contexts/AuthContext.tsx:60`
- **Impact:** Procurement/receiving/returns writes queued offline may remain queued longer than expected or indefinitely in some environments, breaking offline-first task closure credibility.
- **Minimum actionable fix:** Add deterministic replay trigger from the app (e.g., on `window` online event post `SYNC_QUEUE` to active SW, and/or periodic replay trigger after login and page focus) plus an E2E assertion for queued mutation replay.

## 6. Other Findings Summary
- **Severity: Medium** - Retry attempts can leave stale `RUNNING` job records in observability metrics; each retry starts a new run record but only the final run is finalized. Evidence: `repo/server/src/observability/scheduler.service.ts:37`, `repo/server/src/observability/scheduler.service.ts:57`; minimum fix: mark failed attempts explicitly before retrying, or keep one run record and increment attempt count in-place.

## 7. Data Exposure and Delivery Risk Summary
- **Real sensitive information exposure:** **Pass** - no production keys/tokens embedded; password hashes excluded; sensitive supplier fields encrypted-at-rest and masked for non-admin consumers. Evidence: `repo/server/src/users/user.entity.ts:23`, `repo/server/src/suppliers/supplier.entity.ts:40`, `repo/server/src/suppliers/suppliers.controller.ts:12`.
- **Hidden debug / config / demo-only surfaces:** **Pass** - demo seed is explicit and blocked in production. Evidence: `repo/server/src/seeds/demo.seed.ts:23`, `repo/README.md:330`.
- **Undisclosed mock scope / default mock behavior:** **Pass** - noop payment connector and callback disable-by-default are disclosed and gated. Evidence: `repo/server/src/payments/payment-callback.controller.ts:58`, `repo/server/src/payments/payments.module.ts:8`, `repo/README.md:414`.
- **Fake-success or misleading behavior:** **Partial Pass** - SW queueing semantics are explicit, but replay trigger path is incomplete at app wiring level (F-01). Evidence: `repo/client/public/sw.js:166`, `repo/client/public/sw.js:206`.
- **Visible UI / console / storage leakage risk:** **Pass** - no material sensitive payload logging in app runtime paths; server logs structured request metadata without request bodies. Evidence: `repo/server/src/common/interceptors/logging.interceptor.ts:44`.

## 8. Test Sufficiency Summary

### Test Overview
- Unit tests exist: backend Jest + frontend Vitest. Evidence: `repo/server/package.json:10`, `repo/client/package.json:10`.
- Component tests exist: multiple page/route tests. Evidence: `repo/client/src/__tests__/ReceivingForm.test.tsx:83`, `repo/client/src/__tests__/SupplierPortalRoutes.test.tsx:83`.
- Page/route integration tests exist: backend integration suites and role/object isolation tests. Evidence: `repo/server/src/auth/auth.integration.spec.ts:109`, `repo/server/src/notifications/notifications.integration.spec.ts:33`.
- E2E tests exist: Playwright browser/API flows. Evidence: `repo/package.json:6`, `repo/tests/e2e/procurement-lifecycle.spec.ts:38`, `repo/tests/e2e/sw-lifecycle.spec.ts:63`.
- Obvious test entry points documented: `repo/README.md:157`, `repo/README.md:220`.

### Core Coverage
- **happy path:** covered
- **key failure paths:** partially covered
- **interaction / state coverage:** partially covered

### 8.2 Coverage Mapping Table
| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Login + role gate basics | `repo/server/src/auth/auth.integration.spec.ts:173` | 200/401/403 route assertions with real guards (`repo/server/src/auth/auth.integration.spec.ts:150`) | covered | None material | Keep regression tests |
| Supplier object-level isolation | `repo/server/src/auth/auth.integration.spec.ts:522` | Supplier-scoped service call assertions (`repo/server/src/auth/auth.integration.spec.ts:543`) | covered | None material | Keep regression tests |
| Approval thresholds / dual approval | `repo/tests/e2e/procurement-dual-approval.spec.ts:43` | Tier-2 admin-required assertion (`repo/tests/e2e/procurement-dual-approval.spec.ts:141`) | covered | None material | Keep regression tests |
| Receiving variance validation | `repo/server/src/receiving/receiving.integration.spec.ts:205` | Invalid enum / variance reason 400 checks (`repo/server/src/receiving/receiving.service.spec.ts:161`) | covered | None material | Keep regression tests |
| Notification preferences validation | `repo/server/src/notifications/notifications.integration.spec.ts:137` | Invalid body/type/bool 400 checks (`repo/server/src/notifications/notifications.integration.spec.ts:148`) | covered | None material | Keep regression tests |
| Offline mutation queue replay on reconnect | `repo/client/src/__tests__/sw-offline-queue.test.ts:266` | Re-implementation-based replay checks (`repo/client/src/__tests__/sw-offline-queue.test.ts:35`) | insufficient | Browser-level replay trigger from actual app/SW integration not proven | Add Playwright test: queue mutation offline, restore connectivity, assert server-side state change and queue drain |

### 8.3 Security Coverage Audit
- **authentication:** covered - login/refresh/401/rate-limit paths tested. Evidence: `repo/server/src/auth/auth.integration.spec.ts:172`.
- **route authorization:** covered - 403 matrix tested for multiple roles. Evidence: `repo/server/src/auth/auth.integration.spec.ts:362`.
- **object-level authorization:** covered - supplier portal object scoping tests present. Evidence: `repo/server/src/auth/auth.integration.spec.ts:522`.
- **tenant / data isolation:** partially covered - supplier isolation covered; single-tenant app model makes broader tenant isolation mostly Not Applicable. Evidence: `repo/server/src/auth/auth.integration.spec.ts:418`.
- **admin / internal protection:** partially covered - admin endpoint authorization covered in integration, but not all admin data paths are deeply scenario-tested. Evidence: `repo/server/src/admin/admin.integration.spec.ts:178`.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Major security and core happy-path risks are well covered; however, offline queued-mutation replay in real browser/app integration is not sufficiently covered, so severe offline-first defects could still pass current tests.

## 9. Engineering Quality Summary
- **Acceptance 1.1 (Documentation/static verifiability): Pass** - docs/scripts/routes/config are largely consistent and traceable. Evidence: `repo/README.md:90`, `repo/client/vite.config.ts:12`, `repo/server/src/main.ts:14`.
- **Acceptance 1.2 (Prompt alignment): Partial Pass** - core architecture aligns, but offline-first write-closure has a material gap (F-01). Evidence: `repo/client/public/sw.js:161`.
- **Acceptance 2.1 (Core requirement coverage): Partial Pass** - requested modules/flows are implemented; one high-risk offline closure defect remains.
- **Acceptance 2.2 (End-to-end project shape): Pass** - coherent full application with docs and tests. Evidence: `repo/README.md:242`, `repo/server/src/app.module.ts:30`, `repo/client/src/App.tsx:57`.
- **Acceptance 3.1 (Structure/modularity): Pass** - clear module decomposition frontend/backend.
- **Acceptance 3.2 (Maintainability/extensibility): Partial Pass** - generally extensible, but retry run-tracking logic in scheduler harms observability maintainability (M-01).
- **Acceptance 4.1 (Engineering professionalism): Partial Pass** - strong validation/guards/logging baseline; background-run bookkeeping defect remains.
- **Acceptance 4.2 (Product credibility): Partial Pass** - mostly product-grade, with remaining offline mutation replay risk.
- **Acceptance 5.1 (Prompt understanding/fit): Partial Pass** - business semantics mostly accurate; offline-first semantics not fully closed.
- **Acceptance 6 (Visual/interaction quality, static-only): Cannot Confirm (full), Partial Pass (structural support)** - static code shows hierarchy/state hooks, but runtime visual quality still needs manual verification.

## 10. Visual and Interaction Summary
- Static structure supports role-partitioned navigation and connected page flows. Evidence: `repo/client/src/App.tsx:79`, `repo/client/src/components/Sidebar.tsx:12`.
- Core interaction states are present (loading, error, submitting, offline banners, disabled controls). Evidence: `repo/client/src/pages/Login.tsx:63`, `repo/client/src/pages/SearchResults.tsx:78`, `repo/client/src/pages/ReceivingForm.tsx:385`.
- Cannot statically confirm final responsive rendering, animation fidelity, and visual polish without execution/snapshots.

## 11. Next Actions
1. Fix offline queue replay wiring (F-01): send `SYNC_QUEUE` deterministically from app on reconnect/login/focus and validate SW controller availability.
2. Add browser E2E that proves queued mutation replay performs real state change after connectivity restore.
3. Fix scheduler retry bookkeeping (M-01): finalize failed attempts explicitly so job metrics do not retain stale `RUNNING` rows.
4. Add integration test asserting multi-attempt job-run states (`FAILED` attempts + final `SUCCESS`/`FAILED`) in observability endpoints.
5. Manually verify offline-first critical flows (request create, receipt create, return submit) across disconnect/reconnect in target environment.
