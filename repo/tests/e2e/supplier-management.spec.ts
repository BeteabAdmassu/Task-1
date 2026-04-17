import { test, expect } from '@playwright/test';

/**
 * E2E: full-stack supplier-management flow driven through the browser.
 *
 * Unlike the API-only E2E specs (procurement-*, kb-*) that call the API
 * directly from the test runner, this test exercises the
 * browser → Vite proxy → NestJS API → Postgres path end-to-end with no
 * transport mocking.
 *
 *   1. A real user logs in by filling the login form and clicking Sign In.
 *   2. Navigation to /suppliers goes through React Router with the auth
 *      cookie roundtripping as the UI would in production.
 *   3. The supplier list page loads and fetches DB-backed data.
 *
 * This catches regressions in auth cookie handling, the JWT refresh flow,
 * the Vite proxy, the suppliers endpoint role gate, and the list component.
 */

async function uiLogin(page: import('@playwright/test').Page) {
  const username = process.env.E2E_ADMIN_USER ?? 'demo_admin';
  const password = process.env.E2E_ADMIN_PASS ?? 'Demo1234!';

  await page.goto('/login');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 15_000,
  });
}

test.describe('Supplier management — UI flow', () => {
  test('admin logs in via the UI and reaches a post-login route', async ({ page }) => {
    await uiLogin(page);
    // We don't assert a specific post-login path because the role-based
    // redirect may go to /dashboard, /procurement, /admin, etc. The
    // invariant we care about: the user is NOT on /login anymore.
    expect(page.url()).not.toContain('/login');
  });

  test('admin navigates to /suppliers and the list page issues a real /api/suppliers response', async ({
    page,
  }) => {
    await uiLogin(page);

    // Register the response waiter + trigger the navigation in a single
    // `Promise.all` so we can't race the on-mount fetch. waitForResponse is
    // more forgiving than waitForRequest on slow CI hosts because it waits
    // for the full response round-trip rather than the outbound request
    // alone. If the page happens to redirect before the suppliers list
    // renders, the waiter times out — which itself would be a real
    // regression in the auth cookie / JWT refresh / proxy / role-gate
    // chain this test was written to protect.
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          /\/api\/suppliers(\?|$)/.test(r.url()),
        { timeout: 30_000 },
      ),
      page.goto('/procurement/suppliers'),
    ]);

    // The response is from the real API (not a stub) and surfaces a
    // paginated JSON body from Postgres.
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.meta).toBe('object');
  });

  test('admin route guard returns 401 when no access token is attached to a direct fetch', async ({
    page,
  }) => {
    // A direct fetch from the browser WITHOUT the in-memory access token
    // should be rejected. This proves the protected endpoint really is
    // guarded — not that the E2E flow accidentally works via some fallback.
    await uiLogin(page);
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/suppliers?limit=1'); // no credentials, no bearer
      return r.status;
    });
    expect(result).toBe(401);
  });
});
