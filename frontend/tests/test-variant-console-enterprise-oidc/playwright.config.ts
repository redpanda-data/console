import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const reporters = process.env.CI
  ? [['github' as const], ['html' as const, { outputFolder: 'playwright-report' }]]
  : [['list' as const], ['html' as const, { outputFolder: 'playwright-report' }]];

/**
 * Playwright Test configuration for Enterprise OIDC (Zitadel) variant.
 *
 * This variant tests OIDC login flows and Group-Based Access Control (GBAC)
 * using a real Zitadel identity provider running in a testcontainer.
 */
const config = defineConfig({
  timeout: 120 * 1000,

  expect: {
    timeout: 60 * 1000,
  },

  testMatch: '**/*.spec.ts',
  fullyParallel: false, // Sequential: auth tests depend on login state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker: OIDC tests share session state

  reporter: reporters,

  globalSetup: '../shared/global-setup.mjs',
  globalTeardown: '../shared/global-teardown.mjs',

  metadata: {
    variant: 'console-enterprise-oidc',
    variantName: 'console-enterprise-oidc',
    configFile: 'console.config.yaml',
    isEnterprise: true,
    needsShadowlink: false,
    needsZitadel: true,
  },

  use: {
    navigationTimeout: 30 * 1000,
    actionTimeout: 30 * 1000,
    viewport: { width: 1920, height: 1080 },
    headless: !!process.env.CI,
    baseURL: process.env.REACT_APP_ORIGIN ?? 'http://localhost:3200',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'off',
  },

  projects: [
    {
      name: 'oidc-admin-login',
      testMatch: '**/auth-admin.setup.ts',
    },
    {
      name: 'oidc-viewer-login',
      testMatch: '**/auth-viewer.setup.ts',
    },
    {
      name: 'admin-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin-user.json',
      },
      testMatch: '**/admin-access.spec.ts',
      dependencies: ['oidc-admin-login'],
    },
    {
      name: 'viewer-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/viewer-user.json',
      },
      testMatch: '**/viewer-access.spec.ts',
      dependencies: ['oidc-viewer-login'],
    },
    {
      name: 'denied-tests',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: '**/denied-access.spec.ts',
      dependencies: ['oidc-admin-login'],
    },
  ],
});

export default config;
