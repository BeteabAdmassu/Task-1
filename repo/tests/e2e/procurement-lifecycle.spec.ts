import { test, expect } from '@playwright/test';

/**
 * Procurement lifecycle E2E test — API level.
 *
 * Tests the core business flow end-to-end:
 *   Purchase Request → Approval → PO (auto-generated) → Issue → Receipt → Return
 *
 * Uses Playwright's request fixture (HTTP API calls, no browser).
 * Runs against the E2E backend on port 3101 via Vite proxy on port 3100.
 *
 * Prerequisites (same as login.spec.ts):
 *   - Demo seed loaded (npm run seed:demo in repo/server)
 *   - Server compiled and running (Playwright starts it via webServer)
 *
 * Demo users used:
 *   - demo_admin  (ADMINISTRATOR) — creates requests, issues POs, handles returns
 *   - demo_pm     (PROCUREMENT_MANAGER, isSupervisor=true) — approves tier-1 requests
 *   - demo_clerk  (WAREHOUSE_CLERK) — creates receipts
 */

const BASE = 'http://localhost:3101/api';

async function login(request: Parameters<typeof test>[1] extends { request: infer R } ? R : never, username: string, password: string): Promise<string> {
  const res = await request.post(`${BASE}/auth/login`, {
    data: { username, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.accessToken as string;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('Procurement lifecycle', () => {
  test('happy path: request → supervisor approval → PO → receipt → return', async ({ request }) => {
    // ── Step 1: Login ─────────────────────────────────────────────────────────
    const adminToken = await login(request, process.env.E2E_ADMIN_USER ?? 'demo_admin', process.env.E2E_ADMIN_PASS ?? 'Demo1234!');
    const clerkToken = await login(request, 'demo_clerk', 'Demo1234!');

    // Create a fresh supervisor PM for this test run so it is self-contained
    // regardless of whether the seed has been re-run since the isSupervisor migration.
    const ts = Date.now();
    const supervisorPmRes = await request.post(`${BASE}/admin/users`, {
      headers: authHeader(adminToken),
      data: {
        username: `e2e_supervisor_pm_${ts}`,
        password: 'TestPass123!',
        role: 'PROCUREMENT_MANAGER',
        isSupervisor: true,
      },
    });
    expect(supervisorPmRes.status()).toBe(201);
    const supervisorPm = await supervisorPmRes.json();
    const pmToken = await login(request, supervisorPm.username, 'TestPass123!');

    // ── Step 2: Create purchase request (tier-1: $1,500) ─────────────────────
    const prRes = await request.post(`${BASE}/procurement/requests`, {
      headers: authHeader(adminToken),
      data: {
        title: 'E2E Lifecycle Test — Fertilizer Restock',
        description: 'Automated lifecycle test',
        lineItems: [
          { itemDescription: 'NPK Fertilizer 10kg', quantity: 10, unitPrice: 150.00 },
        ],
      },
    });
    expect(prRes.status()).toBe(201);
    const pr = await prRes.json();
    expect(pr.status).toBe('DRAFT');
    expect(pr.approvalTier).toBe(1);

    const prId: string = pr.id;

    // ── Step 3: Submit for approval ───────────────────────────────────────────
    const submitRes = await request.post(`${BASE}/procurement/requests/${prId}/submit`, {
      headers: authHeader(adminToken),
    });
    expect(submitRes.status()).toBe(200);
    const submitted = await submitRes.json();
    expect(submitted.status).toBe('PENDING_APPROVAL');

    // ── Failure path A: Self-approval blocked ─────────────────────────────────
    const selfApproveRes = await request.post(`${BASE}/procurement/requests/${prId}/approve`, {
      headers: authHeader(adminToken),
      data: { action: 'APPROVE' },
    });
    expect(selfApproveRes.status()).toBe(403);

    // ── Failure path B: Non-supervisor PM cannot approve tier-1 ──────────────
    // Create a fresh non-supervisor PM user via admin API
    const nonSupervisorPmRes = await request.post(`${BASE}/admin/users`, {
      headers: authHeader(adminToken),
      data: {
        username: `e2e_nonsupervisor_pm_${ts}`,
        password: 'TestPass123!',
        role: 'PROCUREMENT_MANAGER',
        isSupervisor: false,
      },
    });
    expect(nonSupervisorPmRes.status()).toBe(201);
    const nonSupervisorPm = await nonSupervisorPmRes.json();
    const nonSupervisorPmToken = await login(request, nonSupervisorPm.username, 'TestPass123!');

    const nonSuperApproveRes = await request.post(`${BASE}/procurement/requests/${prId}/approve`, {
      headers: authHeader(nonSupervisorPmToken),
      data: { action: 'APPROVE' },
    });
    expect(nonSuperApproveRes.status()).toBe(403);

    // ── Step 4: Supervisor PM approves tier-1 ────────────────────────────────
    const approveRes = await request.post(`${BASE}/procurement/requests/${prId}/approve`, {
      headers: authHeader(pmToken),
      data: { action: 'APPROVE' },
    });
    expect(approveRes.status()).toBe(200);
    const approved = await approveRes.json();
    expect(approved.status).toBe('APPROVED');

    // ── Step 5: Find the auto-generated PO ───────────────────────────────────
    const posRes = await request.get(`${BASE}/purchase-orders`, {
      headers: authHeader(adminToken),
    });
    expect(posRes.status()).toBe(200);
    const posBody = await posRes.json();
    const po = (posBody.data as Array<{ requestId: string; id: string; status: string; lineItems: Array<{ id: string; quantity: number }> }>)
      .find((p) => p.requestId === prId);
    expect(po).toBeDefined();
    expect(po!.status).toBe('DRAFT');

    const poId = po!.id;
    const poLineItemId = po!.lineItems[0].id;
    const poQuantity = Number(po!.lineItems[0].quantity);

    // ── Step 6: Issue the PO ─────────────────────────────────────────────────
    const issueRes = await request.patch(`${BASE}/purchase-orders/${poId}/issue`, {
      headers: authHeader(adminToken),
      data: {},
    });
    expect(issueRes.status()).toBe(200);
    const issuedPo = await issueRes.json();
    expect(issuedPo.status).toBe('ISSUED');

    // ── Failure path C: Over-receipt blocked ─────────────────────────────────
    const overReceiptRes = await request.post(`${BASE}/receipts`, {
      headers: authHeader(clerkToken),
      data: {
        poId,
        lineItems: [
          { poLineItemId, quantityReceived: poQuantity + 1 },
        ],
      },
    });
    expect(overReceiptRes.status()).toBe(400);

    // ── Step 7: Create and complete receipt ───────────────────────────────────
    const receiptRes = await request.post(`${BASE}/receipts`, {
      headers: authHeader(clerkToken),
      data: {
        poId,
        lineItems: [
          { poLineItemId, quantityReceived: poQuantity },
        ],
      },
    });
    expect(receiptRes.status()).toBe(201);
    const receipt = await receiptRes.json();
    expect(receipt.status).toBe('IN_PROGRESS');

    const receiptId = receipt.id;
    const receiptLineItemId = (receipt.lineItems as Array<{ id: string }>)[0].id;

    const completeRes = await request.patch(`${BASE}/receipts/${receiptId}/complete`, {
      headers: authHeader(clerkToken),
    });
    expect(completeRes.status()).toBe(200);
    const completedReceipt = await completeRes.json();
    expect(completedReceipt.status).toBe('COMPLETED');

    // Verify PO is now FULLY_RECEIVED
    const poAfterReceiptRes = await request.get(`${BASE}/purchase-orders/${poId}`, {
      headers: authHeader(adminToken),
    });
    const poAfterReceipt = await poAfterReceiptRes.json();
    expect(poAfterReceipt.status).toBe('FULLY_RECEIVED');

    // ── Step 8: Create and submit return ─────────────────────────────────────
    const returnRes = await request.post(`${BASE}/returns`, {
      headers: authHeader(adminToken),
      data: {
        receiptId,
        lineItems: [
          {
            receiptLineItemId,
            quantityReturned: 1,
            reasonCode: 'WRONG_ITEM',
            reasonNotes: 'E2E test return',
          },
        ],
      },
    });
    expect(returnRes.status()).toBe(201);
    const returnAuth = await returnRes.json();

    const returnId = returnAuth.id;

    const submitReturnRes = await request.patch(`${BASE}/returns/${returnId}/submit`, {
      headers: authHeader(adminToken),
    });
    expect(submitReturnRes.status()).toBe(200);
    const submittedReturn = await submitReturnRes.json();
    expect(submittedReturn.status).toBe('SUBMITTED');
  });
});
