import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for running E2E in Docker.
 *
 * Unlike the dev-machine config (`playwright.config.ts`) this one does NOT
 * launch its own servers — the `e2e` Compose service depends on `api` and
 * `web` being up, so the runner just points Playwright at `http://web:3000`
 * on the shared Compose network.
 *
 * Note on service workers: browser-level SW tests are skipped in Docker
 * mode (see `tests/e2e/sw-lifecycle.spec.ts`) because the `web:3000` origin
 * is not `localhost`/HTTPS and Chromium's insecure-origin allowlist flag
 * needs `--user-data-dir` — which Playwright's default launch mode does
 * not accept. The SW logic is covered by Vitest unit suites at
 * `tests/client/sw-cache.test.ts` and `tests/client/sw-offline-queue.test.ts`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 45_000,

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://web:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
