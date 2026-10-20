import { chromium } from 'playwright';

import { authenticate } from './auth.setup';
import globalSetup from '../shared/global-setup.mjs';

export default async function setup() {
  const teardown = await globalSetup({
    metadata: {
      variantName: 'console-enterprise',
      configFile: 'console.config.yaml',
      isEnterprise: true,
      needsShadowlink: true,
      needsConnect: false,
    },
  });
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ baseURL: process.env.REACT_APP_ORIGIN ?? 'http://localhost:3100' });
      await authenticate(page);
      await page.context().storageState({ path: 'playwright/.auth/user.json' });
    } finally {
      await browser.close();
    }
  } catch (error) {
    try {
      await teardown();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Enterprise authentication and environment cleanup failed');
    }
    throw error;
  }
  return teardown;
}
