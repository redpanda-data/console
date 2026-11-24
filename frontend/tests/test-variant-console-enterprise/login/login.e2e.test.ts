import { test as base, expect } from '../../shared/e2e';
import { definePlaywrightOptions } from '../../shared/playwright-options';

const test = base.extend({ playwright: definePlaywrightOptions({ storageState: { cookies: [], origins: [] } }) });

const LOGIN_URL = /\/login/u;

test.describe('login', () => {
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
    await expect(submit).toBeEnabled();
  });
});
