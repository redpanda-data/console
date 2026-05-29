import { test as base } from '@playwright/test';

// Extend test fixtures to include shadowBackendURL and featureFlags
type CustomFixtures = {
  shadowBackendURL: string;
  featureFlags: Record<string, boolean>;
};

export const test = base.extend<CustomFixtures>({
  shadowBackendURL: async ({}, use, testInfo) => {
    // Get shadowBackendURL from the project's use options
    const projectUse = testInfo.project.use as any;
    const url = projectUse.shadowBackendURL || 'http://localhost:3001';
    await use(url);
  },
  featureFlags: [{}, { option: true }],
  page: async ({ page, featureFlags }, use) => {
    if (Object.keys(featureFlags).length > 0) {
      await page.addInitScript((flags) => {
        window.__E2E_FEATURE_FLAGS__ = flags;
      }, featureFlags);
    }
    await use(page);
  },
});

export { expect } from '@playwright/test';
