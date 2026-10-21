import { defineConfig } from '@rstest/core';
import { definePlaywrightConfig } from '@rstest/playwright/config';

import { definePlaywrightOptions } from './tests/shared/playwright-options';

export default defineConfig({
  extends: definePlaywrightConfig({ ...definePlaywrightOptions(), launchOptions: { headless: true } }),
  testEnvironment: 'node',
  include: ['tests/shared/e2e-canary.spec.ts', 'tests/runner-cli.spec.ts'],
  passWithNoTests: false,
  pool: { type: 'threads', maxWorkers: 1 },
  reporters: [['md', { preset: 'compact' }]],
  teardownTimeout: 5000,
});
