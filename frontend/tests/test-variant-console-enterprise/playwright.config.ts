import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// Configure reporters based on environment
const reporters = process.env.CI
  ? [['github' as const], ['html' as const, { outputFolder: 'playwright-report' }]]
  : [['list' as const], ['html' as const, { outputFolder: 'playwright-report' }]];

// Resolve the shadow (destination) backend host port. Local runs remap every
// port dynamically via E2E_PORTS_OVERRIDE (set by run-variant.mjs), so the dest
// backend is NOT on the static 3101 — read its actual port from the override.
// CI keeps the static variant.json ports (no override), so 3101 is correct there.
const portsOverride: Record<string, number> | null = (() => {
  try {
    return process.env.E2E_PORTS_OVERRIDE ? JSON.parse(process.env.E2E_PORTS_OVERRIDE) : null;
  } catch {
    return null;
  }
})();
const shadowBackendPort = portsOverride?.backendDest ?? 3101;
const shadowBackendURL = process.env.REACT_APP_SHADOW_ORIGIN ?? `http://localhost:${shadowBackendPort}`;

/**
 * Playwright Test configuration for Enterprise (console-enterprise) variant
 */
const config = defineConfig({
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
  workers: process.env.CI ? 4 : undefined,

  /* Reporter to use */
  reporter: reporters,

  /* Global setup and teardown */
  globalSetup: '../shared/global-setup.mjs',
  globalTeardown: '../shared/global-teardown.mjs',

  /* Custom metadata for setup/teardown */
  metadata: {
    variant: 'console-enterprise',
    variantName: 'console-enterprise',
    configFile: 'console.config.yaml',
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

    /* Shadowlink destination backend URL (dynamic port locally, 3101 in CI) */
    shadowBackendURL,
  } as any,

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

export default config;
