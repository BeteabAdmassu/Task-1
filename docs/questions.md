# Business Logic Questions Log

This document records ambiguous or non-obvious business logic decisions encountered during implementation, the assumptions made, and how each was resolved in code.

---

## 1. Auto-approval threshold and approval tiers

- **Question**: Should purchase requests under a certain amount skip human approval entirely? If so, what are the tier boundaries?
- **My Understanding**: Small-value requests are common in operations (consumables, small restocks) and requiring human sign-off on every one creates unnecessary process overhead.
- **Solution**: Three tiers implemented in `ProcurementService.submit()`:
  - Tier 0 (≤ $500): auto-approved on submit; a draft PO is generated immediately.
  - Tier 1 ($501–$5,000): one approval required.
  - Tier 2 (> $5,000): two approvals required.
  - The requester cannot approve their own request (enforced in `ProcurementService.processApproval()`).

---

## 2. Supplier isolation: 404 vs 403 for cross-supplier access

- **Question**: When a `SUPPLIER` user tries to access another supplier's PO or return, should the API return 403 (Forbidden) or 404 (Not Found)?
- **My Understanding**: A 403 confirms that the resource exists but is inaccessible, which leaks information about other suppliers' order activity. A 404 is safer because it does not confirm existence.
- **Solution**: All supplier-portal endpoints resolve the authenticated user's linked `supplierId` and return `404` (not `403`) for any request that would cross to another supplier's data. Implemented consistently in `SupplierPortalPoController` and `SupplierPortalReturnsController`.

---

## 3. Budget override restricted to ADMINISTRATOR

- **Question**: Should any `PROCUREMENT_MANAGER` be able to override a supplier budget cap, or only administrators?
- **My Understanding**: Budget caps exist to prevent over-commitment. Allowing the same role that creates POs to also override caps would reduce the control value. A separate, higher-privilege role creates an audit trail and a genuine gate.
- **Solution**: `PATCH /purchase-orders/:id/issue` with `{ override: true, overrideReason }` is accepted but checked against caller role in `PurchaseOrdersService.issue()`. If the caller is not `ADMINISTRATOR`, a `403` is thrown before the override is recorded. Every approved override writes a row to `budget_overrides` and an entry to `audit_logs`.

---

## 4. Budget "committed" definition

- **Question**: Which PO statuses should count toward a supplier's committed spend when enforcing the budget cap?
- **My Understanding**: A DRAFT PO has not been sent to the supplier yet and could be cancelled without consequence. Once ISSUED the commitment is real. PARTIALLY_RECEIVED and FULLY_RECEIVED represent goods already delivered.
- **Solution**: Committed = SUM(`totalAmount`) for POs with status in `('ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED')`. DRAFT and CANCELLED POs are excluded. Computed inline in `BudgetService.checkAndEnforce()` inside the same transaction as the advisory lock to prevent TOCTOU races.

---

## 5. Refresh token in response body

- **Question**: Should the refresh token be returned in the JSON response body alongside the access token?
- **My Understanding**: Refresh tokens in response bodies are readable by JavaScript and vulnerable to XSS. The token should only travel as an HttpOnly cookie which JavaScript cannot access.
- **Solution**: `AuthController.refresh()` calls `authService.refresh()` which returns `{ accessToken, refreshToken, user }` internally, but the controller response is narrowed to `{ accessToken, user }`. The `refreshToken` is set via `res.cookie(...)` only. Test asserts `expect(res.body.refreshToken).toBeUndefined()`.

---

## 6. changePassword session preservation

- **Question**: When a user changes their password, should all sessions be invalidated (including the current one) or should the current session survive?
- **My Understanding**: Invalidating all sessions forces the user to log in again immediately after changing their password, which is disruptive. The security goal is to evict any sessions the user did not initiate (e.g. a compromised device), not to log out the current device.
- **Solution**: `AuthService.changePassword()` deletes all session rows where `refreshToken != currentRefreshToken`. The current session is preserved; the response includes an updated access token so the client can continue without re-authenticating.

---

## 7. PAYMENTS_ENABLED guard on the callback endpoint

- **Question**: Should the payment callback endpoint be available by default, or should it require explicit opt-in?
- **My Understanding**: The noop connector accepts every callback without signature verification. If the endpoint were always active, a developer running locally would silently "process" any inbound webhook with no error, masking misconfigured environments. A disabled-by-default posture makes the misconfiguration visible immediately.
- **Solution**: `PaymentCallbackController.handleCallback()` checks `process.env.PAYMENTS_ENABLED !== 'true'` at the top of the handler and throws `ServiceUnavailableException` (503) with a message naming the variable. The endpoint only goes live when explicitly configured.

---

## 8. Article visibility by role

- **Question**: Should all staff roles see all Knowledge Base articles, or should some be restricted?
- **My Understanding**: `SPECIALIST_ONLY` articles likely contain plant-care protocols that are relevant to `PLANT_CARE_SPECIALIST` but not meaningful (or potentially confusing) for warehouse or procurement staff.
- **Solution**: Article list and detail endpoints filter `SPECIALIST_ONLY` status to callers with role `PLANT_CARE_SPECIALIST` or `ADMINISTRATOR`. Other staff roles see only `STOREWIDE` articles (plus their own DRAFT articles if they are authors). `ARCHIVED` articles are not visible to non-admin callers.

---

## 9. Article slug requirement

- **Question**: Is a URL slug required on article creation, or should it be generated automatically?
- **My Understanding**: The `articles.slug` column has a `NOT NULL UNIQUE` constraint at the database level. Allowing the API caller to supply it gives control over URLs; auto-generation would require a separate naming strategy.
- **Solution**: `slug` is a required field in `CreateArticleDto`. The demo seed provides `'demo-caring-for-tropical-houseplants'` explicitly. Uniqueness is enforced by the DB constraint; the API returns a 409/500 if a duplicate slug is submitted (TypeORM unique-constraint error bubbles up).

---

## 10. Low-stock alert auto-submit

- **Question**: Should a low-stock alert ingest create a DRAFT purchase request (requiring manual submission) or auto-submit it?
- **My Understanding**: Low-stock alerts originate from the warehouse and represent urgent restocking needs. Requiring a manual submit step adds latency in a time-sensitive situation. Auto-submission is appropriate because the alert itself is the trigger.
- **Solution**: `POST /procurement/low-stock-alert` creates the purchase request and immediately calls the submit logic. The same approval-tier rules apply — a sub-$500 alert is auto-approved and generates a draft PO. The endpoint is available to `WH | PM | ADM` (warehouse clerks are the primary caller).

---

## 11. Funds ledger advisory lock key

- **Question**: How should concurrent deposits/adjustments to the same supplier's ledger be serialized without a dedicated queue?
- **My Understanding**: PostgreSQL advisory locks provide a lightweight serialization mechanism that stays within the DB transaction boundary. Using `hashtext(supplierId)` as the lock key is consistent with other parts of the codebase and avoids external dependencies.
- **Solution**: `FundsLedgerService` acquires `pg_advisory_xact_lock(hashtext(supplierId))` inside the transaction before writing a ledger entry. `BudgetService` uses the same pattern with key `hashtext('budget-{supplierId}')`. Both locks are released automatically on transaction commit or rollback.

---

## 12. Return policy as single-row configuration

- **Question**: Should return policy (window days, restocking fee, requires-approval flag) be per-supplier or global?
- **My Understanding**: The spec describes a single return policy administered by ADM. Per-supplier policies would require a more complex data model and UI.
- **Solution**: A single `return_policy` row is maintained. `GET /admin/return-policy` returns it; `PATCH /admin/return-policy` updates it. A snapshot of the active policy is stored alongside each return authorization (`returns` table) so historical returns reflect the policy in force at the time.
