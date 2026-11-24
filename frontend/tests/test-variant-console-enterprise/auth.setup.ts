import type { Page } from 'playwright';

async function dismissErrorModalIfPresent(page: Page) {
  const errorModal = page.getByTestId('login-error__ok-button');
  if (await errorModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    await errorModal.click();
    await errorModal.waitFor({ state: 'hidden', timeout: 5000 });
  }
}

/**
 * If startup calls surface an error during auth, dismiss it and wait for the modal control to unmount before continuing.
 */
export async function authenticate(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });

  await page.getByTestId('auth-username-input').waitFor({ state: 'visible', timeout: 30_000 });

  await dismissErrorModalIfPresent(page);

  await page.getByTestId('auth-username-input').fill('e2euser');
  await page.getByTestId('auth-password-input').fill('very-secret');

  await dismissErrorModalIfPresent(page);

  await page.getByTestId('auth-submit').click();

  await page.getByTestId('versionTitle').waitFor({ state: 'visible', timeout: 30_000 });
}
