import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Playwright Test configuration for OSS (console) variant
 */
export default defineConfig({
  expect: {
    timeout: 60 * 1000,
  },

  // Test directory specified in package.json script
  testMatch: '**/*.spec.ts',

  /* Run tests in files in parallel */
  fullyParallel: !!process.env.CI,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Number of parallel workers */
  workers: process.env.CI ? 4 : undefined,

  /* Reporter to use */
  reporter: process.env.CI ? 'html' : 'html',

  /* Global setup and teardown */
  globalSetup: '../shared/global-setup.mjs',
  globalTeardown: '../shared/global-teardown.mjs',

  /* Custom metadata for setup/teardown */
  metadata: {
    variant: 'console',
    variantName: 'console',
    configFile: 'console.config.yaml',
    isEnterprise: false,
    needsShadowlink: false,
  },

  /* Shared settings for all projects */
  use: {
    navigationTimeout: 30 * 1000,
    actionTimeout: 30 * 1000,
    viewport: { width: 1920, height: 1080 },
    headless: !!process.env.CI,

    /* Base URL uses variant-specific backend port */
    baseURL: process.env.REACT_APP_ORIGIN ?? 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
  },

  /* Configure projects */
  projects: [
    // OSS: Single project without authentication
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],
});
