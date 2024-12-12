import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  expect: {
    timeout: 15000,
  },
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: !!process.env.CI,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    navigationTimeout: 15 * 1000,
    viewport: { width: 1920, height: 1080 },
    headless: !!process.env.CI,
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.REACT_APP_ORIGIN ?? 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    { name: 'authenticate', testMatch: /auth\.setup\.ts/ },

    {
      name: 'Console Enterprise',
      testMatch: 'tests/console-enterprise/**/*',
      use: {
        ...devices['Desktop Chrome'],
        // Use prepared auth state.
        storageState: 'playwright/.auth/user.json',
        // baseURL: '// console console-enterprise URL'
      },
      dependencies: ['authenticate'],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      cwd: process.env.CI ? '../../backend/cmd' : '../../console-enterprise/backend/cmd',
      command: process.env.CI
        ? 'go run . --config.filepath=../../console-oss/frontend/tests/config/console.enterprise.config.yaml'
        : 'go run . --config.filepath=../../../console/frontend/tests/config/console.enterprise.config.yaml',
      url: 'http://localhost:9090/admin/startup',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 240 * 1000,
    },
    {
      command: 'npm run start2',
      url: 'http://localhost:3000',
      timeout: 240 * 1000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
