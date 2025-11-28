import { test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Wait for login form to be visible
  await page.getByTestId('auth-username-input').waitFor({ state: 'visible', timeout: 30_000 });

  await page.getByTestId('auth-username-input').fill('e2euser');
  await page.getByTestId('auth-password-input').fill('very-secret');
  await page.getByTestId('auth-submit').click();

  // Wait for successful login - version title appears in footer
  await page.getByTestId('versionTitle').waitFor({ state: 'visible', timeout: 30_000 });

  // End of authentication steps.
  await page.context().storageState({ path: authFile });
});
