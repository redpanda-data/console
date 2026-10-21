import { defineConfig } from '@rstest/core';
import { definePlaywrightConfig } from '@rstest/playwright/config';

export default defineConfig({
  name: 'browser',
  extends: definePlaywrightConfig({ launchOptions: { headless: true } }),
  testEnvironment: 'node',
  include: ['tests/browser/*.spec.ts'],
  passWithNoTests: false,
  pool: { type: 'threads', maxWorkers: 1 },
  reporters: [['md', { preset: 'compact' }], ...(process.env.CI ? ['github-actions' as const] : [])],
  teardownTimeout: 5000,
});
