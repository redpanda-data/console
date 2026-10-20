import { authenticate } from './auth.setup';
import { test as base } from '../shared/e2e';
import { definePlaywrightOptions } from '../shared/playwright-options';

const test = base.extend({ playwright: definePlaywrightOptions({ storageState: { cookies: [], origins: [] } }) });

test('authenticate', async ({ page }) => {
  await authenticate(page);
});
