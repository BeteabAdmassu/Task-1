import { test, expect } from '@playwright/test';

/**
 * E2E login-flow smoke tests.
 *
 * These run against a Vite dev server started by Playwright (see
 * playwright.config.ts `webServer`). The Vite proxy forwards /api/*
 * to the NestJS backend — no request interception needed.
 *
 * Prerequisites:
 *   - Backend running on port 3001
 *   - Demo seed loaded (npm run seed:demo in repo/server)
 *
 * Override credentials via env vars:
 *   E2E_ADMIN_USER=demo_admin E2E_ADMIN_PASS=Demo1234! npm run test:e2e
 */

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('login page renders username and password fields with a Sign In button', async ({ page }) => {
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText('Sign In');
  });

  test('invalid credentials display a login error message', async ({ page }) => {
    await page.locator('#username').fill('notauser');
    await page.locator('#password').fill('WrongPass99!');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.login-error')).toBeVisible({ timeout: 5000 });
  });

  test('valid credentials redirect away from /login', async ({ page }) => {
    const username = process.env.E2E_ADMIN_USER ?? 'demo_admin';
    const password = process.env.E2E_ADMIN_PASS ?? 'Demo1234!';

    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10_000,
    });
    expect(page.url()).not.toContain('/login');
  });
});
