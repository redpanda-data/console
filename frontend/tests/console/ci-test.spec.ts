import { expect, test } from '@playwright/test';

// Intentionally failing test to verify CI pipeline
test.describe('CI Pipeline Test', () => {
  test('should fail intentionally to test CI', async ({ page }) => {
    await page.goto('/');

    // This assertion will fail intentionally
    await expect(page).toHaveTitle('This Title Does Not Exist');
  });
});
