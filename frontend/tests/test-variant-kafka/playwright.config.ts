import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const reporters = process.env.CI
  ? [['github' as const], ['html' as const, { outputFolder: 'playwright-report' }]]
  : [['list' as const], ['html' as const, { outputFolder: 'playwright-report' }]];

const config = defineConfig({
  expect: {
    timeout: 60 * 1000,
  },

  testMatch: '**/*.spec.ts',

  fullyParallel: !!process.env.CI,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 1 : 0,
  retryStrategy: process.env.CI ? 'isolated' : 'immediate',

  workers: process.env.CI ? 4 : undefined,

  reporter: reporters,

  globalSetup: '../shared/global-setup.mjs',

  metadata: {
    variant: 'kafka',
    variantName: 'kafka',
    configFile: 'console.config.yaml',
    isEnterprise: false,
    isKafka: true,
    needsShadowlink: false,
  },

  use: {
    navigationTimeout: 30 * 1000,
    actionTimeout: 30 * 1000,
    viewport: { width: 1920, height: 1080 },
    headless: !!process.env.CI,

    baseURL: process.env.REACT_APP_ORIGIN ?? 'http://localhost:3002',

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],
});

export default config;
