import { expect, test } from '@playwright/test';

const LOGIN_URL = /\/login/;

/**
 * The credential form's failure path. `auth.setup.ts` exercises the success path for
 * every enterprise spec, so a rejected password is only asserted here.
 */
test.describe('Login', () => {
  // A fresh context: the shared storageState would skip the form entirely.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('rejects a wrong password inline and stays on the login page', async ({ page }) => {
    await page.goto('/login');

    const submit = page.getByTestId('auth-submit');
    await page.getByTestId('auth-username-input').fill('e2euser');
    await page.getByTestId('auth-password-input').fill('not-the-password');
    await submit.click();

    const alert = page.getByTestId('auth-error');
    await expect(alert).toBeVisible();
    await expect(alert).not.toBeEmpty();
    await expect(page).toHaveURL(LOGIN_URL);
    // In flight the button is disabled; once the request settles a retry is possible.
    await expect(submit).toBeEnabled();
  });
});
