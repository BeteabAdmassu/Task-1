# API Specification — GreenLeaf Operations Suite

Base URL: `http://localhost:3001/api`  
Auth: `Authorization: Bearer <accessToken>` on every protected endpoint.  
Rate limit: 200 req / 60 s per IP (global). Login: 10 req / 15 min per IP.

---

## Role abbreviations

| Symbol | Role |
|--------|------|
| ADM | `ADMINISTRATOR` |
| PM | `PROCUREMENT_MANAGER` |
| WH | `WAREHOUSE_CLERK` |
| PC | `PLANT_CARE_SPECIALIST` |
| SUP | `SUPPLIER` |
| — | Public (no auth required) |

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Returns `{ status: "ok" }` |

---

## Authentication

| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| POST | `/auth/login` | — | `{ username, password }` | Authenticates user. Returns `{ accessToken, user }`. Sets `refresh_token` HttpOnly cookie. Rate-limited: 10/15 min. |
| POST | `/auth/refresh` | — (cookie) | — | Rotates refresh token. Reads `refresh_token` cookie. Returns `{ accessToken, user }`. Sets new cookie. |
| POST | `/auth/logout` | — (cookie) | — | Invalidates session. Clears cookie. Returns `{ message }`. |
| POST | `/auth/change-password` | Any | `{ currentPassword, newPassword }` | Changes password. Invalidates all other sessions; preserves current. Returns `{ message }`. |

---

## Admin — Users

All endpoints require `ADM`.

| Method | Path | Body / Query | Description |
|--------|------|-------------|-------------|
| GET | `/admin/users` | `?page&limit&role&isActive&search` | Paginated user list |
| POST | `/admin/users` | `{ username, password, role, … }` | Create user |
| PATCH | `/admin/users/:id` | `{ role?, isActive?, … }` | Update user |
| POST | `/admin/users/:id/reset-password` | — | Reset to random password; returns new password |

---

## Suppliers

Read access: `PM | ADM`. Sensitive fields (`bankingNotes`, `internalRiskFlag`, `budgetCap`) returned only to `ADM`.

| Method | Path | Auth | Body / Query | Description |
|--------|------|------|-------------|-------------|
| GET | `/suppliers` | PM \| ADM | `?search&paymentTerms&isActive&page&limit&sortBy&sortOrder` | Paginated supplier list |
| GET | `/suppliers/dropdown` | PM \| ADM | — | `[{ id, name }]` for form selects (active only) |
| GET | `/suppliers/:id` | PM \| ADM | — | Supplier detail |
| POST | `/suppliers` | PM \| ADM | `{ name, contactName?, email?, phone?, address?, paymentTerms?, bankingNotes?, internalRiskFlag?, budgetCap? }` | Create supplier |
| PATCH | `/suppliers/:id` | PM \| ADM | Same fields, all optional. `budgetCap: null` removes cap. | Update supplier |

### Supplier Budget (on PATCH `/suppliers/:id`)

Set or clear the budget cap via `budgetCap` in the update body. Null removes the cap. No dedicated budget endpoint — cap is part of the supplier record.

---

## Supplier Portal (SUPPLIER only)

Object-level isolation: every endpoint resolves the authenticated user's linked `supplierId` and refuses access to other suppliers' data with `404`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/supplier-portal/profile` | Own supplier profile (no sensitive/encrypted fields) |
| GET | `/supplier-portal/purchase-orders` | Own POs (`ISSUED`, `PARTIALLY_RECEIVED`, `FULLY_RECEIVED`, `CLOSED`) |
| GET | `/supplier-portal/purchase-orders/:id` | Own PO detail |
| GET | `/supplier-portal/returns` | Own return authorizations |
| GET | `/supplier-portal/returns/:id` | Own return detail |

---

## Procurement — Purchase Requests

Auth: `PM | ADM`

| Method | Path | Body / Query | Description |
|--------|------|-------------|-------------|
| GET | `/procurement/requests` | `?status&search&page&limit&sortBy&sortOrder` | Paginated request list |
| GET | `/procurement/requests/approval-queue` | `?page&limit` | All `PENDING_APPROVAL` requests |
| GET | `/procurement/requests/:id` | — | Request detail with line items and approvals |
| POST | `/procurement/requests` | `{ title, description?, supplierId?, lineItems: [{ itemDescription, quantity, unitPrice, catalogItemId? }] }` | Create DRAFT request |
| PATCH | `/procurement/requests/:id` | Same fields, all optional | Update DRAFT request only |
| POST | `/procurement/requests/:id/submit` | — | Submit for approval. Auto-approves if totalAmount ≤ $500 and generates draft PO. |
| POST | `/procurement/requests/:id/approve` | `{ action: "APPROVE" \| "REJECT", comments? }` | Process approval step. Requester cannot approve own request. |
| POST | `/procurement/requests/:id/cancel` | — | Cancel DRAFT or PENDING_APPROVAL request |

**Approval tiers:**

| Tier | Amount | Approvals required |
|------|--------|--------------------|
| 0 | ≤ $500 | Auto-approved on submit |
| 1 | $501–$5,000 | 1 |
| 2 | > $5,000 | 2 |

### Low-Stock Alert Ingest

Auth: `WH | PM | ADM`

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/procurement/low-stock-alert` | `{ title, supplierId?, items: [{ description, quantity, unitPrice }], notes? }` | Creates and auto-submits a purchase request from a stock alert |

---

## Purchase Orders

Auth: `PM | ADM`

| Method | Path | Body / Query | Description |
|--------|------|-------------|-------------|
| GET | `/purchase-orders` | `?status&supplierId&dateFrom&dateTo&page&limit&sortBy&sortOrder` | Paginated PO list |
| GET | `/purchase-orders/:id` | — | PO detail with line items |
| PATCH | `/purchase-orders/:id` | `{ expectedDeliveryDate?, notes? }` | Update editable fields (any non-closed status) |
| PATCH | `/purchase-orders/:id/issue` | `{ override?: boolean, overrideReason?: string }` | Issue DRAFT PO. Enforces supplier budget cap. `override=true` + `overrideReason` (≥10 chars) bypasses cap — **ADM only**. |
| PATCH | `/purchase-orders/:id/cancel` | — | Cancel DRAFT, ISSUED, or PARTIALLY_RECEIVED PO |

**Budget cap enforcement on issue:**  
- If the supplier has a `budgetCap` and `committed + po.totalAmount > budgetCap` → `400` with cap/committed/available figures.  
- Concurrent issue requests for the same supplier are serialized via `pg_advisory_xact_lock`.  
- Override requires `override: true` + `overrideReason`; caller must be `ADM` or `403` is returned. Override recorded in `budget_overrides` table and audit log.

---

## Receiving

| Method | Path | Auth | Body / Query | Description |
|--------|------|------|-------------|-------------|
| GET | `/receipts` | WH \| PM \| ADM | `?poId&page&limit` | Paginated receipt list |
| POST | `/receipts` | WH \| ADM | `{ poId, lineItems: [{ poLineItemId, quantityReceived, putawayLocationId?, varianceReasonCode? }], entryMode?: "MANUAL"\|"BARCODE", notes? }` | Create receipt. Variance reason required when received ≠ expected. |
| PATCH | `/receipts/:id/complete` | WH \| ADM | — | Mark receipt complete; updates PO status |
| GET | `/putaway-locations` | WH \| ADM | — | Active putaway locations for dropdown |

### Putaway Locations — Admin

Auth: `ADM`

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/admin/putaway-locations` | — | All locations (including inactive) |
| POST | `/admin/putaway-locations` | `{ name, zone?, description?, isActive? }` | Create location |
| PATCH | `/admin/putaway-locations/:id` | Same, all optional | Update location |
| DELETE | `/admin/putaway-locations/:id` | — | Delete location |

---

## Returns

Auth: `PM | ADM`

| Method | Path | Body / Query | Description |
|--------|------|-------------|-------------|
| GET | `/returns` | `?status&supplierId&page&limit` | Paginated return list |
| GET | `/returns/:id` | — | Return detail with line items and policy snapshot |
| POST | `/returns` | `{ poId, reason, lineItems: [{ poLineItemId, quantity, condition? }], notes? }` | Create DRAFT return authorization |
| PATCH | `/returns/:id/submit` | — | Submit return for processing |
| PATCH | `/returns/:id/status` | `{ status }` | Update return status |

### Return Policy — Admin

Auth: `ADM`

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/admin/return-policy` | — | Current return policy |
| PATCH | `/admin/return-policy` | `{ windowDays?, restockingFeePercent?, requiresApproval?, notes? }` | Update policy |

---

## Funds Ledger

Auth: `PM | ADM` (reads); `ADM` (mutations)

| Method | Path | Body / Query | Description |
|--------|------|-------------|-------------|
| GET | `/suppliers/:supplierId/ledger` | `?dateFrom&dateTo&page&limit` | Ledger entries + running summary |
| POST | `/suppliers/:supplierId/ledger/deposit` | `{ amount, description?, referenceType?, referenceId? }` | Record a deposit |
| POST | `/suppliers/:supplierId/ledger/adjustment` | `{ amount, description, referenceType?, referenceId? }` | Record adjustment (positive or negative) |

Ledger mutations are serialized per supplier via `pg_advisory_xact_lock(hashtext(supplierId))`.

---

## Knowledge Base

Read access: `ADM | PM | WH | PC`. Write access: `ADM | PC`. Promote: `ADM` only.  
Article visibility is role-filtered: `SPECIALIST_ONLY` articles visible to `PC` and `ADM` only.

| Method | Path | Auth | Body / Query | Description |
|--------|------|------|-------------|-------------|
| GET | `/articles` | All staff | `?category&status&search&page&limit` | Paginated article list (role-filtered) |
| GET | `/articles/search` | All staff | `?q&category&tags` | Full-text search with synonym expansion |
| GET | `/articles/slug/:slug` | All staff | — | Article by slug |
| GET | `/articles/:id` | All staff | — | Article detail |
| GET | `/articles/:id/similar` | All staff | — | Similar articles (trigram/tsvector) |
| GET | `/articles/:id/versions` | All staff | — | Version history |
| GET | `/articles/:id/versions/:versionNumber` | All staff | — | Specific version |
| POST | `/articles` | ADM \| PC | `{ title, slug, content, category, status, tags? }` | Create article |
| PATCH | `/articles/:id` | ADM \| PC | Same fields, all optional | Update article (creates new version) |
| PATCH | `/articles/:id/promote` | ADM | `{ status }` | Promote/demote article status |
| POST | `/articles/:id/favorite` | All staff | — | Add to favorites (`204`) |
| DELETE | `/articles/:id/favorite` | All staff | — | Remove from favorites (`204`) |
| GET | `/articles/:id/favorite` | All staff | — | Check if favorited |
| GET | `/users/me/favorites` | All staff | — | Current user's favorited articles |
| GET | `/users/me/search-history` | All staff | `?q` | Recent search history |

**Article status values:** `DRAFT` · `SPECIALIST_ONLY` · `STOREWIDE` · `ARCHIVED`

---

## Notifications

Auth: all roles (including `SUP`)

| Method | Path | Query / Body | Description |
|--------|------|-------------|-------------|
| GET | `/notifications` | `?unreadOnly&page&limit` | Current user's notifications |
| GET | `/notifications/unread-count` | — | `{ count: number }` |
| PATCH | `/notifications/read-all` | — | Mark all read (`204`) |
| PATCH | `/notifications/:id/read` | — | Mark one read |
| GET | `/notifications/preferences` | — | User notification preferences |
| PATCH | `/notifications/preferences` | `{ preferences: Record<NotificationType, boolean> }` | Update preferences |

---

## Search Synonyms — Admin

Auth: `ADM`

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/admin/synonyms` | — | All synonym groups |
| GET | `/admin/synonyms/:id` | — | Single synonym group |
| POST | `/admin/synonyms` | `{ terms: string[] }` | Create synonym group |
| PATCH | `/admin/synonyms/:id` | `{ terms?: string[] }` | Update synonym group |
| DELETE | `/admin/synonyms/:id` | — | Delete synonym group (`204`) |

---

## Data Quality — Admin

Auth: `ADM`

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| GET | `/admin/duplicates` | `?status&entityType` | Duplicate candidates |
| GET | `/admin/duplicates/:id` | — | Duplicate detail with entity data |
| POST | `/admin/duplicates/:id/merge` | — | Merge duplicate (`204`) |
| POST | `/admin/duplicates/:id/dismiss` | — | Dismiss duplicate (`204`) |
| GET | `/admin/data-quality/issues` | — | Last quality report |
| POST | `/admin/data-quality/run-check` | — | Trigger quality check now |
| GET | `/admin/data-quality/summary` | — | `{ pendingDuplicates, issuesFound, lastCheckedAt, counts }` |

---

## Observability — Admin

Auth: `ADM`

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| GET | `/admin/logs` | `?level&service&from&to&page&limit` | Structured system logs |
| GET | `/admin/jobs` | — | Background job run metrics |
| POST | `/admin/jobs/:id/retry` | — | Trigger retry of a named job |
| GET | `/admin/system/stats` | — | Queue stats + system stats |

---

## Payments Callback

**Public** — no JWT required. Requires `PAYMENTS_ENABLED=true` env var or returns `503`.

| Method | Path | Headers / Body | Description |
|--------|------|---------------|-------------|
| POST | `/payments/callback` | Body: `{ idempotencyKey?, connectorName?, event?, payload? }`. Alt: `X-Idempotency-Key` header. | Inbound webhook. Verifies signature via connector. Idempotent: duplicate key returns cached result. Returns `{ processed, alreadyProcessed, result }`. |

**Error responses:**

| Status | Condition |
|--------|-----------|
| 503 | `PAYMENTS_ENABLED` not set to `"true"` |
| 401 | Connector signature verification failed |
| 400 | No idempotency key in body or header |
| 200 | Processed (fresh or duplicate) |

---

## Common response shapes

**Paginated list:**
```json
{
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

**Error:**
```json
{ "statusCode": 400, "message": "...", "error": "Bad Request" }
```

**Audit:** Every mutating endpoint writes to `audit_logs`. Sensitive endpoints also write to `budget_overrides`.
