import { expect, test } from '../shared/e2e';

test.describe('licenses', () => {
  test('should list an enterprise license', async ({ page }) => {
    await page.goto('/overview', {
      waitUntil: 'domcontentloaded',
    });
    const licensingEl = page.locator('[data-testid="overview-license-name"]');

    // Assert that at least one element is visible and contains the text
    await expect(licensingEl.first()).toBeVisible();
  });

  test('should be able to upload new license', async ({ page, skip }) => {
    if (process.env.TEST_DATA_VALID_LICENSE === undefined) {
      skip();
    }
    const licenseContent = process.env.TEST_DATA_VALID_LICENSE as string;

    await page.goto('/overview', {
      waitUntil: 'domcontentloaded',
    });
    const licensingEl = page.locator('a[href="/upload-license"]:has-text("Upload new license")');
    licensingEl.click();

    await page.waitForURL('/upload-license');

    await page.getByTestId('license').fill(licenseContent);
    await page.getByTestId('upload-license').click();
    await expect(page.locator('h1:has-text("License uploaded")')).toBeVisible();
  });
});
