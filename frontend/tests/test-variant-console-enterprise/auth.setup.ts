import { type Page, test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

/**
 * Dismisses the login error modal if present and waits for it to close.
 * The modal can appear from failed API calls during page load.
 */
async function dismissErrorModalIfPresent(page: Page): Promise<void> {
  const errorModal = page.getByTestId('login-error__ok-button');
  // Check if modal button is visible (give it reasonable time to appear)
  if (await errorModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    await errorModal.click();
    // Wait for the modal overlay to disappear
    await page
      .locator('.chakra-modal__overlay')
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {
        // no op
      });
  }
}

setup('authenticate', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Wait for login form to be visible
  await page.getByTestId('auth-username-input').waitFor({ state: 'visible', timeout: 30_000 });

  // Dismiss error modal if present (can appear from previous failed API calls)
  await dismissErrorModalIfPresent(page);

  await page.getByTestId('auth-username-input').fill('e2euser');
  await page.getByTestId('auth-password-input').fill('very-secret');

  // Dismiss error modal again if it appeared during credential entry
  await dismissErrorModalIfPresent(page);

  await page.getByTestId('auth-submit').click();

  // Wait for successful login - version title appears in footer
  await page.getByTestId('versionTitle').waitFor({ state: 'visible', timeout: 30_000 });

  // End of authentication steps.
  await page.context().storageState({ path: authFile });
});
