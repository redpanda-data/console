import { expect, test } from './e2e';

const REDPANDA_TITLE_REGEX = /Redpanda/u;

test.describe('seed Test for Redpanda Console', () => {
  test('seed - application setup and basic navigation', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(REDPANDA_TITLE_REGEX);

    await expect(page.getByTestId('versionTitle')).toBeVisible();
  });
});
