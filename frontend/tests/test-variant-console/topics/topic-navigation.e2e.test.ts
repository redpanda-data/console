import { step } from '../../shared/e2e';

// spec: specs/topics.md
// seed: tests/shared/seed.e2e.test.ts

import { expect, test } from '../../shared/e2e';
import { TopicPage } from '../utils/topic-page';

const MESSAGES_TAB_CONTENT = /No messages found|Partition|Offset/iu;

test.describe('topic Details - Navigation and Tabs', () => {
  test('should navigate to topic details and view basic information', async ({ page }) => {
    const topicName = `nav-test-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Navigate to topic details', async () => {
      await page.goto('/topics');
      await page.getByTestId(`topic-link-${topicName}`).click();

      await expect(page).toHaveURL(new RegExp(`/topics/${topicName}`, 'u'));

      await expect(page.getByText(topicName).first()).toBeVisible();

      await expect(page.getByRole('tablist')).toBeVisible({ timeout: 10_000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should view messages tab as default', async ({ page }) => {
    const topicName = `messages-tab-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Navigate to topic and verify Messages tab', async () => {
      await page.getByTestId(`topic-link-${topicName}`).click();

      await expect(page.getByRole('tablist')).toBeVisible();

      await expect(page.locator('text=Messages').first()).toBeVisible();

      await expect(page.getByText(/No messages found|Partition|Offset/iu).first()).toBeVisible({ timeout: 10_000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should navigate to tab via URL hash', async ({ page }) => {
    const topicName = `url-hash-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Navigate directly to Configuration tab via URL', async () => {
      await page.goto(`/topics/${topicName}#configuration`);

      await expect(page.getByTestId('config-group-table')).toBeVisible({ timeout: 5000 });
    });

    await step('Navigate directly to Partitions tab via URL', async () => {
      await page.goto(`/topics/${topicName}#partitions`);

      await expect(page.getByText(/Partition|Leader/iu).first()).toBeVisible({ timeout: 5000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should view configuration tab with grouped settings', async ({ page }) => {
    const topicName = `config-groups-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Navigate to Configuration tab', async () => {
      await page.goto(`/topics/${topicName}#configuration`);
      await expect(page.getByRole('tablist')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('config-group-table')).toBeVisible({ timeout: 15_000 });

      const sidebar = page.getByRole('navigation', { name: 'Configuration categories' });
      await expect(sidebar).toBeVisible();
      const categoryCount = await sidebar.getByRole('button').count();

      expect(categoryCount).toBeGreaterThan(0);

      await expect(page.getByRole('heading', { name: 'Retention' })).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should open produce record with non-default max results in the URL', async ({ page }) => {
    const topicName = `produce-nav-${crypto.randomUUID()}`;
    await page.clock.install();

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Produce Record stays on the produce page', async () => {
      await page.goto(`/topics/${topicName}?s=20&pageSize=10`);
      await expect(page.getByText(MESSAGES_TAB_CONTENT).first()).toBeVisible({ timeout: 10_000 });

      await topicPage.clickProduceRecordButton();
      await expect(page).toHaveURL(new RegExp(`/topics/${topicName}/produce-record`, 'u'));

      await page.clock.runFor(1000);
      await expect(page).toHaveURL(new RegExp(`/topics/${topicName}/produce-record`, 'u'));
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should navigate back to topics list via breadcrumb', async ({ page }) => {
    const topicName = `breadcrumb-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await page.goto('/topics');
    await page.getByTestId(`topic-link-${topicName}`).click();

    await step('Navigate back using breadcrumb', async () => {
      await page.getByRole('link', { name: 'Topics' }).first().click();

      await expect(page).toHaveURL(/\/topics/u);
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });
});
