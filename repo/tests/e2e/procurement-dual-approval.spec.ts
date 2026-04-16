import { test, expect } from '@playwright/test';

/**
 * E2E tests for procurement approval edge-cases not covered by the main
 * lifecycle test:
 *
 *   1. Tier-2 dual-approval ($5,000+):
 *      - A supervisor PM alone cannot fully approve (needs ≥ 1 ADMINISTRATOR)
 *      - Dual approval succeeds when a supervisor PM approves first, then an ADMINISTRATOR
 *
 *   2. Budget-cap override (ADMINISTRATOR role):
 *      - Issue is blocked when a supplier's budget cap is exceeded (400)
 *      - ADMINISTRATOR can override the cap by passing override=true
 *
 * Prerequisites:
 *   - Demo seed loaded (npm run seed:demo in repo/server)
 *   - E2E backend running on port 3101
 */

const BASE = `${process.env.E2E_API_URL || 'http://localhost:3101'}/api`;

type APIRequestContext = Parameters<typeof test>[1] extends { request: infer R } ? R : never;

async function login(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${BASE}/auth/login`, {
    data: { username, password },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.accessToken as string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Tier-2 dual-approval ──────────────────────────────────────────────────────

test.describe('Tier-2 dual-approval (> $5,000)', () => {
  test(
    'supervisor PM alone cannot fully approve a tier-2 request; ' +
    'admin second approval completes it',
    async ({ request }) => {
      const adminToken = await login(
        request,
        process.env.E2E_ADMIN_USER ?? 'demo_admin',
        process.env.E2E_ADMIN_PASS ?? 'Demo1234!',
      );
      const ts = Date.now();

      // Create a supervisor PM who will give the first approval
      const supervisorRes = await request.post(`${BASE}/admin/users`, {
        headers: auth(adminToken),
        data: {
          username: `e2e_sup_pm_tier2_${ts}`,
          password: 'TestPass123!',
          role: 'PROCUREMENT_MANAGER',
          isSupervisor: true,
        },
      });
      expect(supervisorRes.status()).toBe(201);
      const supervisor = await supervisorRes.json();
      const pmToken = await login(request, supervisor.username, 'TestPass123!');

      // Create a fresh requester (admin acts as requester — admin cannot self-approve)
      const requesterRes = await request.post(`${BASE}/admin/users`, {
        headers: auth(adminToken),
        data: {
          username: `e2e_requester_tier2_${ts}`,
          password: 'TestPass123!',
          role: 'PROCUREMENT_MANAGER',
          isSupervisor: false,
        },
      });
      expect(requesterRes.status()).toBe(201);
      const requester = await requesterRes.json();
      const requesterToken = await login(request, requester.username, 'TestPass123!');

      // ── Create tier-2 request ($6,000 total) ──────────────────────────────────
      const prRes = await request.post(`${BASE}/procurement/requests`, {
        headers: auth(requesterToken),
        data: {
          title: `E2E Tier-2 Dual Approval ${ts}`,
          description: 'Automated tier-2 dual-approval test',
          lineItems: [
            { itemDescription: 'Greenhouse Irrigation System', quantity: 6, unitPrice: 1000.0 },
          ],
        },
      });
      expect(prRes.status()).toBe(201);
      const pr = await prRes.json();
      expect(pr.approvalTier).toBe(2);
      const prId: string = pr.id;

      // Submit for approval
      const submitRes = await request.post(`${BASE}/procurement/requests/${prId}/submit`, {
        headers: auth(requesterToken),
      });
      expect(submitRes.status()).toBe(200);
      expect((await submitRes.json()).status).toBe('PENDING_APPROVAL');

      // ── First approval: supervisor PM ─────────────────────────────────────────
      const firstApprovalRes = await request.post(
        `${BASE}/procurement/requests/${prId}/approve`,
        {
          headers: auth(pmToken),
          data: { action: 'APPROVE', comments: 'First approval — PM supervisor' },
        },
      );
      expect(firstApprovalRes.status()).toBe(200);

      // After one approval the request is still PENDING (needs admin too)
      const afterFirst = await firstApprovalRes.json();
      expect(afterFirst.status).toBe('PENDING_APPROVAL');

      // ── Verify that another non-admin supervisor PM alone cannot complete it ──
      const anotherPmRes = await request.post(`${BASE}/admin/users`, {
        headers: auth(adminToken),
        data: {
          username: `e2e_another_pm_${ts}`,
          password: 'TestPass123!',
          role: 'PROCUREMENT_MANAGER',
          isSupervisor: true,
        },
      });
      const anotherPm = await anotherPmRes.json();
      const anotherPmToken = await login(request, anotherPm.username, 'TestPass123!');

      const noAdminApprovalRes = await request.post(
        `${BASE}/procurement/requests/${prId}/approve`,
        {
          headers: auth(anotherPmToken),
          data: { action: 'APPROVE' },
        },
      );
      // Must fail — no ADMINISTRATOR approval present yet
      expect(noAdminApprovalRes.status()).toBe(403);

      // ── Second approval: ADMINISTRATOR — completes the request ────────────────
      const adminApprovalRes = await request.post(
        `${BASE}/procurement/requests/${prId}/approve`,
        {
          headers: auth(adminToken),
          data: { action: 'APPROVE', comments: 'Second approval — Admin' },
        },
      );
      expect(adminApprovalRes.status()).toBe(200);
      const fullyApproved = await adminApprovalRes.json();
      expect(fullyApproved.status).toBe('APPROVED');
    },
  );
});

// ── Budget-cap override ───────────────────────────────────────────────────────

test.describe('Budget-cap override (ADMINISTRATOR only)', () => {
  test(
    'issuing a PO is blocked when supplier budget cap is exceeded; ' +
    'ADMINISTRATOR can override with override=true',
    async ({ request }) => {
      const adminToken = await login(
        request,
        process.env.E2E_ADMIN_USER ?? 'demo_admin',
        process.env.E2E_ADMIN_PASS ?? 'Demo1234!',
      );
      const ts = Date.now();

      // Create a capped supplier
      const supplierRes = await request.post(`${BASE}/suppliers`, {
        headers: auth(adminToken),
        data: {
          name: `E2E Capped Supplier ${ts}`,
          paymentTerms: 'NET_30',
          budgetCap: 100, // tiny cap — any PO will exceed it
        },
      });
      expect(supplierRes.status()).toBe(201);
      const supplier = await supplierRes.json();
      const supplierId: string = supplier.id;

      // Create and approve a $200 request (exceeds the $100 cap)
      const prRes = await request.post(`${BASE}/procurement/requests`, {
        headers: auth(adminToken),
        data: {
          title: `E2E Budget Override ${ts}`,
          supplierId,
          lineItems: [
            { itemDescription: 'Fertilizer', quantity: 2, unitPrice: 100.0 },
          ],
        },
      });
      expect(prRes.status()).toBe(201);
      const pr = await prRes.json();
      const prId: string = pr.id;

      // Submit → auto-approved (≤ $500)
      const submitRes = await request.post(`${BASE}/procurement/requests/${prId}/submit`, {
        headers: auth(adminToken),
      });
      expect(submitRes.status()).toBe(200);

      // Retrieve the auto-generated PO
      const posRes = await request.get(`${BASE}/purchase-orders`, { headers: auth(adminToken) });
      const pos = (await posRes.json()).data as Array<{ requestId: string; id: string; status: string }>;
      const po = pos.find((p) => p.requestId === prId);
      expect(po).toBeDefined();
      const poId = po!.id;

      // ── Attempt to issue without override — must be blocked by budget cap ─────
      const blockedRes = await request.patch(`${BASE}/purchase-orders/${poId}/issue`, {
        headers: auth(adminToken),
        data: {},
      });
      // 400 = budget cap exceeded, override not requested
      expect(blockedRes.status()).toBe(400);
      const blockedBody = await blockedRes.json();
      expect(blockedBody.message).toMatch(/budget/i);

      // ── override=true without overrideReason fails DTO validation (400) ───────
      const missingReasonRes = await request.patch(`${BASE}/purchase-orders/${poId}/issue`, {
        headers: auth(adminToken),
        data: { override: true },
      });
      expect(missingReasonRes.status()).toBe(400);

      // ── ADMINISTRATOR overrides the cap ───────────────────────────────────────
      const overrideRes = await request.patch(`${BASE}/purchase-orders/${poId}/issue`, {
        headers: auth(adminToken),
        data: { override: true, overrideReason: 'Emergency greenhouse restock approved by board' },
      });
      expect(overrideRes.status()).toBe(200);
      const issuedPo = await overrideRes.json();
      expect(issuedPo.status).toBe('ISSUED');
    },
  );

  test('non-ADMINISTRATOR cannot use the budget override flag (returns 403)', async ({ request }) => {
    const adminToken = await login(
      request,
      process.env.E2E_ADMIN_USER ?? 'demo_admin',
      process.env.E2E_ADMIN_PASS ?? 'Demo1234!',
    );
    const ts = Date.now();

    // Create a non-supervisor PM
    const pmRes = await request.post(`${BASE}/admin/users`, {
      headers: auth(adminToken),
      data: {
        username: `e2e_pm_no_override_${ts}`,
        password: 'TestPass123!',
        role: 'PROCUREMENT_MANAGER',
        isSupervisor: false,
      },
    });
    const pm = await pmRes.json();
    const pmToken = await login(request, pm.username, 'TestPass123!');

    // Create a capped supplier
    const supplierRes = await request.post(`${BASE}/suppliers`, {
      headers: auth(adminToken),
      data: { name: `E2E PM No Override ${ts}`, paymentTerms: 'NET_30', budgetCap: 50 },
    });
    const supplier = await supplierRes.json();
    const supplierId: string = supplier.id;

    // Create, submit, and auto-approve a small request against the capped supplier
    const prRes = await request.post(`${BASE}/procurement/requests`, {
      headers: auth(pmToken),
      data: {
        title: `E2E PM Override Blocked ${ts}`,
        supplierId,
        lineItems: [{ itemDescription: 'Seeds', quantity: 1, unitPrice: 100.0 }],
      },
    });
    const pr = await prRes.json();
    const prId: string = pr.id;

    await request.post(`${BASE}/procurement/requests/${prId}/submit`, {
      headers: auth(pmToken),
    });

    const posRes = await request.get(`${BASE}/purchase-orders`, { headers: auth(pmToken) });
    const pos = (await posRes.json()).data as Array<{ requestId: string; id: string }>;
    const po = pos.find((p) => p.requestId === prId);
    expect(po).toBeDefined();
    const poId = po!.id;

    // PM tries to override — must be rejected with 403
    const overrideRes = await request.patch(`${BASE}/purchase-orders/${poId}/issue`, {
      headers: auth(pmToken),
      data: { override: true, overrideReason: 'Urgent restock approved by operations manager' },
    });
    expect(overrideRes.status()).toBe(403);
  });
});
