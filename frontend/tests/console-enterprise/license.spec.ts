import { test, expect } from '@playwright/test';

test.describe('Licenses', () => {
    test('should list an enterprise license', async ({page}) => {
        await page.goto('/overview', {
            waitUntil: 'domcontentloaded'
        });
        const licensingEl = page.locator('[data-testid="overview-license-name"]');

        // Assert that at least one element is visible and contains the text
        await expect(licensingEl.filter({ hasText: 'Console Enterprise' }).first()).toBeVisible();
    });

    test('should be able to upload new license', async ({page}) => {
        test.skip( process.env.TEST_DATA_VALID_LICENSE === undefined, 'env variable TEST_DATA_VALID_LICENSE not provided');
        const licenseContent = process.env.TEST_DATA_VALID_LICENSE as string

        await page.goto('/overview', {
            waitUntil: 'domcontentloaded'
        });
        const licensingEl = page.locator('a[href="/admin/upload-license"]:has-text("Upload new license")');
        licensingEl.click()

        await page.waitForURL('/admin/upload-license')

        await page.getByTestId('license').fill(licenseContent);
        await page.getByTestId('upload-license').click()
        await expect(page.locator('h1:has-text("License uploaded successfully")')).toBeVisible();
    })
})
