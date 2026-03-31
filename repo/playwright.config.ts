import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the GreenLeaf Operations Suite.
 *
 * Launches two servers automatically:
 *   1. A dedicated NestJS backend on port 3101 with a relaxed login
 *      throttle (AUTH_LOGIN_THROTTLE_LIMIT=1000) so repeated test runs
 *      never hit 429.  Uses the same PostgreSQL database as the dev
 *      backend — all demo-seed data is available.
 *   2. A Vite dev server on port 3100 whose proxy points at the E2E
 *      backend (VITE_API_PORT=3101).
 *
 * The developer's servers on ports 3000/3001 are not affected.
 *
 * Prerequisites:
 *   1. PostgreSQL running with greenleaf_db
 *   2. Demo seed loaded: cd repo/server && npm run seed:demo
 *   3. Server built:     cd repo/server && npx nest build
 *   4. Browsers:         cd repo && npx playwright install chromium
 *
 * Run:
 *   cd repo && npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,

  webServer: [
    // ── E2E backend (port 3101) ──────────────────────────────────────────
    {
      command: 'node dist/main.js',
      cwd: './server',
      url: 'http://127.0.0.1:3101/api/health',
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        ...process.env,
        API_PORT: '3101',
        AUTH_LOGIN_THROTTLE_LIMIT: '1000',
        JWT_SECRET: process.env.JWT_SECRET || 'e2e-test-secret-long-enough-32-chars!!',
        PAYMENTS_ENABLED: 'false',
      },
    },
    // ── E2E frontend (port 3100) ─────────────────────────────────────────
    {
      command: 'npx vite --port 3100',
      cwd: './client',
      url: 'http://localhost:3100',
      reuseExistingServer: true,
      timeout: 15_000,
      env: {
        ...process.env,
        VITE_API_PORT: '3101',
      },
    },
  ],

  use: {
    baseURL: 'http://localhost:3100',
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
