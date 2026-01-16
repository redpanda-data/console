import { test as base } from '@playwright/test';

// Extend test fixtures to include shadowBackendURL
type CustomFixtures = {
  shadowBackendURL: string;
};

export const test = base.extend<CustomFixtures>({
  shadowBackendURL: async ({}, use, testInfo) => {
    // Get shadowBackendURL from the project's use options
    const projectUse = testInfo.project.use as any;
    const url = projectUse.shadowBackendURL || 'http://localhost:3001';
    await use(url);
  },
});

export { expect } from '@playwright/test';
