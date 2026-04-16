import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for running E2E in Docker.
 *
 * Unlike the dev-machine config (`playwright.config.ts`) this one does NOT
 * launch its own servers — the `e2e` Compose service depends on `api` and
 * `web` being up, so the runner just points Playwright at `http://web:3000`
 * on the shared Compose network.
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
