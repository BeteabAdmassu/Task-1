import { test, expect } from '@playwright/test';

/**
 * E2E login flow tests.
 *
 * Requires both servers to be running:
 *   - Backend:  cd repo/server && npm run start:dev   (port 3001)
 *   - Frontend: cd repo/client && npm run dev         (port 3000)
 *
 * Default credentials use the demo seed (npm run seed:demo in repo/server).
 * Override via env vars:
 *   E2E_ADMIN_USER=demo_admin E2E_ADMIN_PASS=Demo1234! npm run test:e2e
 *
 * Run: cd repo && npm run test:e2e
 *
 * Note: the Vite dev proxy can silently fail on Windows when `localhost`
 * resolves to IPv6. This test bypasses the proxy by intercepting /api/*
 * requests and routing them directly to the backend at 127.0.0.1.
 * To fix the proxy itself, change the target in client/vite.config.ts
 * to 'http://127.0.0.1:3001' and restart the Vite dev server.
 */

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3001';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass the Vite dev proxy by routing /api/* directly to the backend.
    // Only intercept requests whose pathname starts with /api/ — NOT
    // Vite's source-module requests like /src/api/auth.ts.
    await page.route(
      (url) => new URL(url).pathname.startsWith('/api/'),
      async (route) => {
        const original = route.request();
        const backendUrl = original.url().replace(/^https?:\/\/[^/]+/, BACKEND);

        const response = await route.fetch({
          url: backendUrl,
          method: original.method(),
          headers: {
            ...original.headers(),
            origin: CORS_ORIGIN,
          },
          postData: original.postDataBuffer() ?? undefined,
        });

        await route.fulfill({ response });
      },
    );

    await page.goto('/login');
  });

  // ── Structural ───────────────────────────────────────────────────────────────

  test('login page renders username and password fields with a Sign In button', async ({ page }) => {
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText('Sign In');
  });

  // ── Error path ───────────────────────────────────────────────────────────────

  test('invalid credentials display a login error message', async ({ page }) => {
    await page.locator('#username').fill('notauser');
    await page.locator('#password').fill('WrongPass99!');
    await page.locator('button[type="submit"]').click();

    // The Login component renders errors inside .login-error
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 5000 });
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  test('valid credentials redirect away from /login', async ({ page }) => {
    const username = process.env.E2E_ADMIN_USER ?? 'demo_admin';
    const password = process.env.E2E_ADMIN_PASS ?? 'Demo1234!';

    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();

    // After a successful login the router redirects to the role dashboard
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).not.toContain('/login');
  });
});
