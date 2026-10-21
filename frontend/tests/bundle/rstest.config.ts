import { defineConfig } from '@rstest/core';
import { definePlaywrightConfig } from '@rstest/playwright/config';

export default defineConfig({
  name: 'bundle',
  root: import.meta.dirname,
  extends: definePlaywrightConfig({
    launchOptions: { headless: true },
    contextOptions: {
      baseURL: 'http://127.0.0.1:4178',
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: '.rstest/videos' },
    },
    trace: 'retain-on-failure',
  }),
  testEnvironment: 'node',
  include: ['*.spec.ts'],
  passWithNoTests: false,
  pool: { type: 'threads', maxWorkers: 1 },
  bail: 3,
  testTimeout: 60_000,
  globalSetup: './rstest-global-setup.ts',
  reporters: [['md', { preset: 'compact' }]],
  teardownTimeout: 5000,
});
