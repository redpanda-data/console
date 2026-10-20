import 'dotenv/config';
import { defineConfig } from '@rstest/core';
import { definePlaywrightConfig } from '@rstest/playwright/config';

import { forbidFocusedTests } from './forbid-focused-tests';
import { definePlaywrightOptions } from './playwright-options';
import { resolve } from 'node:path';

export function e2eConfig(
  variant: string,
  { workers, retries, timeout = 30_000 }: { workers: number; retries: number; timeout?: number }
) {
  return defineConfig({
    name: variant,
    root: resolve(import.meta.dirname, '..', `test-variant-${variant}`),
    extends: definePlaywrightConfig(definePlaywrightOptions({}, variant)),
    env: { E2E_VARIANT: variant },
    testEnvironment: 'node',
    include: ['**/*.spec.ts'],
    passWithNoTests: false,
    pool: { type: 'threads', maxWorkers: process.env.CI || variant === 'console' ? workers : undefined },
    retry: process.env.CI ? retries : 0,
    testTimeout: timeout,
    hookTimeout: 120_000,
    expect: { poll: { timeout: 60_000 } },
    globalSetup: process.argv.includes('list') ? [] : './rstest-global-setup.ts',
    reporters: [
      forbidFocusedTests(),
      ['md', { preset: 'compact' }],
      ...(process.env.CI ? ['github-actions' as const] : []),
    ],
    teardownTimeout: 5000,
  });
}
