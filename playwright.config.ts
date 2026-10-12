import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const testEnvironment = parseEnv(readFileSync(`${__dirname}/.local/test.env`, 'utf8'));
process.env.E2E_PASSWORD = testEnvironment.E2E_PASSWORD;

export default defineConfig({
  testDir: './tests',
  globalSetup: './scripts/browser-setup.mjs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'off',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: [
    {
      command: 'pnpm --filter @hucescholar/api dev',
      url: 'http://127.0.0.1:3101/api/v1/health',
      env: { ...testEnvironment, PORT: '3101', HOST: '127.0.0.1', NODE_ENV: 'test' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node ../../scripts/pdfjs-assets.mjs && pnpm exec next dev --hostname 127.0.0.1 --port 3100',
      cwd: './apps/web',
      url: 'http://127.0.0.1:3100',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3101', NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
