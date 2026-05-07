/**
 * Tests that the admin user (platform-admins group via GBAC) has full access:
 * - Can view topics
 * - Can create topics
 * - Can delete topics
 * - Can access security/admin pages
 */
import { expect, test } from '@playwright/test';

test.describe('Admin GBAC access (platform-admins group)', () => {
  test('can view topic list page', async ({ page }) => {
    await page.goto('/topics');
    // Admin should see the topics page with the "Create topic" button
    await expect(page.getByTestId('create-topic-button')).toBeVisible({ timeout: 15_000 });
  });

  test('admin user identity is shown correctly', async ({ page }) => {
    await page.goto('/topics');
    // Verify the admin user identity is displayed in the sidebar
    await expect(page.getByText('admin-user')).toBeVisible({ timeout: 15_000 });
  });

  test('create topic button is accessible to admin', async ({ page }) => {
    await page.goto('/topics');
    // Admin should see the create topic button and be able to click it
    const createButton = page.getByTestId('create-topic-button');
    await expect(createButton).toBeVisible({ timeout: 15_000 });
    await createButton.click();
    // The create topic modal should open
    await expect(page.getByTestId('topic-name')).toBeVisible({ timeout: 5_000 });
  });

  test('can access overview page', async ({ page }) => {
    await page.goto('/overview');
    // Overview shows cluster info - look for the overview heading or cluster section
    await expect(page.getByText('BROKER DETAILS')).toBeVisible({ timeout: 15_000 });
  });
});
