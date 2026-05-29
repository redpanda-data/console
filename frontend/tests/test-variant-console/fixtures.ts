import { test as base } from '@playwright/test';

type CustomFixtures = {
  featureFlags: Record<string, boolean>;
};

export const test = base.extend<CustomFixtures>({
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
