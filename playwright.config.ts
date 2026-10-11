import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: [
    {
      command: 'pnpm --filter @hucescholar/api dev',
      url: 'http://127.0.0.1:3101/api/v1/health',
      env: { PORT: '3101', HOST: '127.0.0.1', NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3100',
      cwd: './apps/web',
      url: 'http://127.0.0.1:3100',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3101', NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
