import { test as base } from '@playwright/test';

// Extend test fixtures to include shadowBackendURL and featureFlags
export type CustomTestOptions = {
  shadowBackendURL: string;
  featureFlags: Record<string, boolean>;
};

export const test = base.extend<CustomTestOptions>({
  shadowBackendURL: ['http://localhost:3001', { option: true }],
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
