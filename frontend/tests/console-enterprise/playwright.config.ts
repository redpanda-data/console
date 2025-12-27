import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Playwright Test configuration for Enterprise (console-enterprise) variant
 */
export default defineConfig({
  // Extended timeout for shadowlink tests
  timeout: 120 * 1000,

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

  /* Reduced workers for enterprise/shadowlink setup */
  workers: process.env.CI ? 2 : undefined,

  /* Reporter to use */
  reporter: process.env.CI ? 'list' : 'html',

  /* Global setup and teardown */
  globalSetup: '../shared/global-setup.mjs',
  globalTeardown: '../shared/global-teardown.mjs',

  /* Custom metadata for setup/teardown */
  metadata: {
    variant: 'console-enterprise',
    variantName: 'console-enterprise',
    configFile: 'console.enterprise.config.yaml',
    isEnterprise: true,
    needsShadowlink: true,
  },

  /* Shared settings for all projects */
  use: {
    navigationTimeout: 30 * 1000,
    actionTimeout: 30 * 1000,
    viewport: { width: 1920, height: 1080 },
    headless: !!process.env.CI,

    /* Base URL uses enterprise backend port */
    baseURL: process.env.REACT_APP_ORIGIN ?? 'http://localhost:3100',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Disable screenshots and videos in CI for better performance */
    screenshot: 'off',
    video: 'off',
  },

  /* Configure projects */
  projects: [
    // Enterprise: Authentication setup project
    {
      name: 'authenticate',
      testMatch: '**/auth.setup.ts',
    },
    // Enterprise: Main test project with auth state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['authenticate'],
    },
  ],
});
