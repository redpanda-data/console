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

/**
 * Navigates to the login page and waits for the username input to be visible.
 * Retries with page reload if the form doesn't appear (backend may not be fully ready yet).
 */
async function navigateToLoginPage(page: Page): Promise<void> {
  // Navigate directly to /login to avoid redirect timing issues from /
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // Wait for login form with reload retry (backend auth system may need a moment)
  const usernameInput = page.getByTestId('auth-username-input');
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isVisible = await usernameInput.isVisible({ timeout: 8000 }).catch(() => false);
    if (isVisible) {
      return;
    }

    if (attempt < maxAttempts) {
      // Reload the page and try again — the backend auth system may still be initializing
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  }
}

setup('authenticate', async ({ page }) => {
  await navigateToLoginPage(page);

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
