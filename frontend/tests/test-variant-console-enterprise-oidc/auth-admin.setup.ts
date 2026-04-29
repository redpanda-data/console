import { test as setup } from '@playwright/test';
import { loginViaOIDC } from './fixtures';

const authFile = 'playwright/.auth/admin-user.json';

setup('authenticate admin via OIDC', async ({ page }) => {
  await loginViaOIDC(page, 'admin-user');
  await page.context().storageState({ path: authFile });
});
