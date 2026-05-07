import { test as setup } from '@playwright/test';
import { loginViaOIDC } from './fixtures';

const authFile = 'playwright/.auth/viewer-user.json';

setup('authenticate viewer via OIDC', async ({ page }) => {
  await loginViaOIDC(page, 'viewer-user');
  await page.context().storageState({ path: authFile });
});
