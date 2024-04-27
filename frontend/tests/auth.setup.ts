import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
    await page.goto('/');

    // check if there is an error modal, closed it if needed
    // const errorOKButton = page.getByTestId('login-error__ok-button')
    // if(errorOKButton) {
    //     await errorOKButton.click()
    // }

    await page.getByTestId('auth-username-input').fill('e2euser');
    await page.getByTestId('auth-password-input').fill('very-secret');
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('versionTitle')).toBeVisible();

    // End of authentication steps.
    await page.context().storageState({path: authFile});
});
