import { defineConfig } from '@rstest/core';
import { definePlaywrightConfig } from '@rstest/playwright/config';

import { isNonEmptyString } from './src/utils/string-utils';

export default defineConfig({
  name: 'browser',
  extends: definePlaywrightConfig({ launchOptions: { headless: true } }),
  testEnvironment: 'node',
  include: ['tests/browser/*.spec.ts'],
  passWithNoTests: false,
  pool: { type: 'threads', maxWorkers: 1 },
  reporters: [['md', { preset: 'compact' }], ...(isNonEmptyString(process.env.CI) ? ['github-actions' as const] : [])],
  teardownTimeout: 5000,
});
