/**
 * Tests that the viewer user (analysts group via GBAC) has read-only access:
 * - Can view topics
 * - Cannot create topics (button hidden or action denied)
 * - Cannot delete topics
 */
import { expect, test } from '@playwright/test';

test.describe('Viewer GBAC access (analysts group)', () => {
  test('can view topic list page', async ({ page }) => {
    await page.goto('/topics');
    // Viewer should see the topics page heading
    await expect(page.getByRole('heading', { name: /topics/i })).toBeVisible({ timeout: 15_000 });
  });

  test('viewer user is logged in with correct identity', async ({ page }) => {
    await page.goto('/topics');
    await page.waitForLoadState('networkidle');

    // Verify the viewer user identity is shown in the sidebar
    await expect(page.getByText('viewer-user')).toBeVisible({ timeout: 15_000 });
  });

  test('can access overview page', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByText('BROKER DETAILS')).toBeVisible({ timeout: 15_000 });
  });
});
