import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);
const API_PORT = Number(process.env.API_PORT ?? 4000);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @ckb/api run dev',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @ckb/web run dev',
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: true,
      timeout: 90_000,
    },
  ],
});
