// spec: specs/topics.md
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

import { TopicPage } from '../utils/topic-page';

test.describe('Topic Details - Navigation and Tabs', () => {
  test('should navigate to topic details and view basic information', async ({ page }) => {
    const topicName = `nav-test-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Navigate to topic details', async () => {
      await page.goto('/topics');
      await page.getByTestId(`topic-link-${topicName}`).click();

      // URL changes to topic details
      await expect(page).toHaveURL(new RegExp(`/topics/${topicName}`));

      // Topic name appears
      await expect(page.getByText(topicName)).toBeVisible();

      // Topic tabs should be visible
      await expect(page.getByRole('tablist')).toBeVisible({ timeout: 10_000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should view messages tab as default', async ({ page }) => {
    const topicName = `messages-tab-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Navigate to topic and verify Messages tab', async () => {
      await page.getByTestId(`topic-link-${topicName}`).click();

      // Topic tabs should be visible
      await expect(page.getByRole('tablist')).toBeVisible();

      // Messages tab should be active by default
      await expect(page.locator('text=Messages').first()).toBeVisible();

      // Message-related elements should be visible
      await expect(page.getByText(/No messages found|Partition|Offset/i).first()).toBeVisible({ timeout: 10_000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should navigate to tab via URL hash', async ({ page }) => {
    const topicName = `url-hash-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Navigate directly to Configuration tab via URL', async () => {
      await page.goto(`/topics/${topicName}#configuration`);

      // Configuration tab should be active
      await expect(page.getByTestId('config-group-table')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Navigate directly to Partitions tab via URL', async () => {
      await page.goto(`/topics/${topicName}#partitions`);

      // Partitions tab content should be visible
      await expect(page.getByText(/Partition|Leader/i).first()).toBeVisible({ timeout: 5000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should view configuration tab with grouped settings', async ({ page }) => {
    const topicName = `config-groups-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Navigate to Configuration tab', async () => {
      await page.goto(`/topics/${topicName}#configuration`);
      await expect(page.getByTestId('config-group-table')).toBeVisible();

      // Verify that configuration groups are present
      // Note: This test is flexible and will pass even if new groups are added
      const configGroups = page.locator('.configGroupTitle');
      const groupCount = await configGroups.count();

      // At least some configuration groups should be visible
      expect(groupCount).toBeGreaterThan(0);

      // Verify Retention group is present (a core group that should always exist)
      await expect(page.locator('.configGroupTitle').filter({ hasText: 'Retention' })).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should navigate back to topics list via breadcrumb', async ({ page }) => {
    const topicName = `breadcrumb-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await page.goto('/topics');
    await page.getByTestId(`topic-link-${topicName}`).click();

    await test.step('Navigate back using breadcrumb', async () => {
      // Click on "Topics" breadcrumb
      await page.getByRole('link', { name: 'Topics' }).first().click();

      // Should return to topics list
      await expect(page).toHaveURL(/\/topics/);
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });
});
