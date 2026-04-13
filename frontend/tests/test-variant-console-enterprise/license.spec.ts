import { expect, test } from '@playwright/test';

test.describe('Licenses', () => {
  test('should list an enterprise license', async ({ page }) => {
    await page.goto('/overview', {
      waitUntil: 'domcontentloaded',
    });
    const licensingEl = page.locator('[data-testid="overview-license-name"]');

    // When multiple licenses of the same type exist (e.g., both a Redpanda Core and a Console
    // trial license), the source prefix is omitted and only the type is shown (e.g., "Trial").
    // When only one license of a type exists, the source is included (e.g., "Console Enterprise").
    // Accept any enterprise-grade license label regardless of how many licenses are present.
    await expect(licensingEl.filter({ hasText: /Enterprise|Trial/ }).first()).toBeVisible();
  });

  test('should be able to upload new license', async ({ page }) => {
    test.skip(process.env.TEST_DATA_VALID_LICENSE === undefined, 'env variable TEST_DATA_VALID_LICENSE not provided');
    const licenseContent = process.env.TEST_DATA_VALID_LICENSE as string;

    await page.goto('/overview', {
      waitUntil: 'domcontentloaded',
    });
    const licensingEl = page.locator('a[href="/upload-license"]:has-text("Upload new license")');
    licensingEl.click();

    await page.waitForURL('/upload-license');

    await page.getByTestId('license').fill(licenseContent);
    await page.getByTestId('upload-license').click();
    await expect(page.locator('h1:has-text("License uploaded successfully")')).toBeVisible();
  });
});
