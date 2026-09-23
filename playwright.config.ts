import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node apps/backend/dist/server.cjs',
        url: 'http://127.0.0.1:3000/healthz',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
        env: {
          ADMIN_API_KEY: process.env.ADMIN_API_KEY ?? 'test-admin-e2e-token-secret-1234567890',
          ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET ?? 'test-admin-session-secret-at-least-32-chars-long',
        },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
