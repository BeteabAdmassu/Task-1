import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the GreenLeaf Operations Suite.
 *
 * Run against the local Vite dev server (port 3000).
 * Start both backend (npm run start:dev in repo/server) and
 * frontend (npm run dev in repo/client) before running E2E tests.
 *
 * Usage:
 *   cd repo && npm install && npx playwright install chromium
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    // Frontend dev server runs on port 3000 (see client/vite.config.ts)
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
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
