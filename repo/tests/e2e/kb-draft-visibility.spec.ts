import { test, expect } from '@playwright/test';

/**
 * E2E test — Knowledge-base draft visibility (phased-release semantics).
 *
 * Validates:
 *   1. A Specialist can create a DRAFT article.
 *   2. A different Specialist can READ that draft (phased-release collaboration).
 *   3. A non-specialist (WAREHOUSE_CLERK) CANNOT read another user's draft.
 *   4. After admin promotes to STOREWIDE, all roles can read the article.
 *
 * Uses Playwright's request fixture (API-level, no browser).
 * Runs against the E2E backend on port 3101.
 */

const BASE = 'http://localhost:3101/api';

async function login(
  request: Parameters<typeof test>[1] extends { request: infer R } ? R : never,
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

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('KB draft visibility — phased release', () => {
  test('specialists share draft visibility; non-specialists do not', async ({ request }) => {
    const adminToken = await login(request, 'demo_admin', 'Demo1234!');

    // Create two specialist users for this test
    const ts = Date.now();
    const specARes = await request.post(`${BASE}/admin/users`, {
      headers: authHeader(adminToken),
      data: { username: `e2e_spec_a_${ts}`, password: 'TestPass123!', role: 'PLANT_CARE_SPECIALIST' },
    });
    expect(specARes.status()).toBe(201);
    const specA = await specARes.json();

    const specBRes = await request.post(`${BASE}/admin/users`, {
      headers: authHeader(adminToken),
      data: { username: `e2e_spec_b_${ts}`, password: 'TestPass123!', role: 'PLANT_CARE_SPECIALIST' },
    });
    expect(specBRes.status()).toBe(201);
    const specB = await specBRes.json();

    const specAToken = await login(request, specA.username, 'TestPass123!');
    const specBToken = await login(request, specB.username, 'TestPass123!');
    const clerkToken = await login(request, 'demo_clerk', 'Demo1234!');

    // ── Step 1: Specialist A creates a DRAFT article ──────────────────────
    const createRes = await request.post(`${BASE}/articles`, {
      headers: authHeader(specAToken),
      data: {
        title: `E2E Draft Visibility Test ${ts}`,
        content: 'Draft content for phased-release visibility test.',
        category: 'GENERAL',
      },
    });
    expect(createRes.status()).toBe(201);
    const article = await createRes.json();
    expect(article.status).toBe('DRAFT');
    const articleId: string = article.id;

    // ── Step 2: Specialist B can READ the draft ────────────────────────────
    const specBReadRes = await request.get(`${BASE}/articles/${articleId}`, {
      headers: authHeader(specBToken),
    });
    expect(specBReadRes.status()).toBe(200);
    const specBArticle = await specBReadRes.json();
    expect(specBArticle.id).toBe(articleId);
    expect(specBArticle.status).toBe('DRAFT');

    // ── Step 3: WAREHOUSE_CLERK cannot read the draft ──────────────────────
    const clerkReadRes = await request.get(`${BASE}/articles/${articleId}`, {
      headers: authHeader(clerkToken),
    });
    expect(clerkReadRes.status()).toBe(404);

    // ── Step 4: Admin promotes to STOREWIDE ────────────────────────────────
    const promoteRes = await request.patch(`${BASE}/articles/${articleId}/promote`, {
      headers: authHeader(adminToken),
      data: { status: 'STOREWIDE' },
    });
    expect(promoteRes.status()).toBe(200);
    const promoted = await promoteRes.json();
    expect(promoted.status).toBe('STOREWIDE');

    // ── Step 5: All roles can now read the article ─────────────────────────
    const clerkReadAfterRes = await request.get(`${BASE}/articles/${articleId}`, {
      headers: authHeader(clerkToken),
    });
    expect(clerkReadAfterRes.status()).toBe(200);
    const clerkArticle = await clerkReadAfterRes.json();
    expect(clerkArticle.status).toBe('STOREWIDE');
  });
});
