import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();
dotenv.config({
  debug: true,
});

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  expect: {
    timeout: 60 * 1000,
  },
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: !!process.env.CI,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 4 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Global setup and teardown */
  globalSetup: './tests/global-setup.mjs',
  globalTeardown: './tests/global-teardown.mjs',
  /* Custom metadata for setup/teardown */
  metadata: {
    isEnterprise: false,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    navigationTimeout: 30 * 1000,
    actionTimeout: 30 * 1000,
    viewport: { width: 1920, height: 1080 },
    headless: !!process.env.CI,
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.REACT_APP_ORIGIN ?? 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Grant clipboard permissions for tests
        permissions: ['clipboard-read', 'clipboard-write'],
        // Use prepared auth state.
        // storageState: 'playwright/.auth/user.json',
      },
    },
  ],
});
