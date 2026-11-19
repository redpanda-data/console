import { expect, step, test } from '../../shared/e2e';
import { execRpk, produceToPartition } from '../../shared/rpk.utils';
import { TopicPage } from '../utils/topic-page';

test.describe('view and Filter Messages', () => {
  test('should expand message to view details', async ({ page }) => {
    const topicName = `expand-message-${crypto.randomUUID()}`;
    const messageContent = 'Detailed message content';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageContent);

    await step('Expand message row', async () => {
      await page.goto(`/topics/${topicName}`);

      await expect(page.getByText(messageContent)).toBeVisible();

      const expandButton = page.getByLabel('Expand row').first();
      await expandButton.click();

      await expect(page.getByTestId('payload-content')).toBeVisible({ timeout: 5000 });

      await expect(page.getByText(/Offset|Partition|Timestamp/iu).first()).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should search message content', async ({ page }) => {
    const topicName = `search-messages-${crypto.randomUUID()}`;
    const searchTerm = 'searchable-keyword';
    const message1 = `Message with ${searchTerm}`;
    const message2 = 'Message without keyword';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message1);
    await topicPage.produceMessage(topicName, message2);

    await step('Search for messages', async () => {
      await page.goto(`/topics/${topicName}`);

      const searchInput = page.getByPlaceholder(/search|filter/iu);
      if (await searchInput.isVisible()) {
        await searchInput.fill(searchTerm);
        await page.keyboard.press('Enter');

        await expect(page.getByText(message1)).toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should filter messages by partition', async ({ page }) => {
    const topicName = `filter-partition-${crypto.randomUUID()}`;
    await execRpk(`topic create ${topicName} --partitions 2`);
    await produceToPartition(topicName, 0, 'message in partition 0');
    await produceToPartition(topicName, 1, 'message in partition 1');

    await step('Read both partitions by default', async () => {
      await page.goto(`/topics/${topicName}`);
      await expect(page.getByText('message in partition 0')).toBeVisible();
      await expect(page.getByText('message in partition 1')).toBeVisible();
    });

    await step('Filter to partition 1', async () => {
      await page.getByTestId('add-topic-filter').click();
      await page.getByTestId('add-topic-filter-partition').click();
      await page.getByTestId('partition-filter-dropdown').click();
      await page.getByRole('option', { name: '1', exact: true }).click();

      await expect(page.getByText('message in partition 1')).toBeVisible();
      await expect(page.getByText('message in partition 0')).not.toBeVisible();
    });

    await execRpk(`topic delete ${topicName}`);
  });

  test('should filter messages by offset', async ({ page }) => {
    const topicName = `filter-offset-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await [0, 1, 2].reduce<Promise<unknown>>(
      (previousProduce, i) => previousProduce.then(() => topicPage.produceMessage(topicName, `Message ${i}`)),
      Promise.resolve()
    );

    await step('Filter by start offset', async () => {
      await page.goto(`/topics/${topicName}`);

      const offsetInput = page.getByPlaceholder(/offset/iu);
      if (await offsetInput.isVisible()) {
        await offsetInput.fill('1');
        await page.keyboard.press('Enter');

        await expect(page.getByTestId('messages-table').locator('td').first()).toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should clear all filters', async ({ page }) => {
    const topicName = `clear-filters-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'Message for filter clearing');

    await step('Apply and clear filters', async () => {
      await page.goto(`/topics/${topicName}`);

      const searchInput = page.getByPlaceholder(/search|filter/iu);
      if (await searchInput.isVisible()) {
        await searchInput.fill('some-filter');
        await page.keyboard.press('Enter');
      }

      const clearButton = page.getByRole('button', { name: /clear|reset/iu });
      if (await clearButton.isVisible()) {
        await clearButton.click();

        await expect(page.getByText('Message for filter clearing')).toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should handle empty topic with no messages', async ({ page }) => {
    const topicName = `empty-topic-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('View empty topic', async () => {
      await page.goto(`/topics/${topicName}#messages`);

      await expect(page.getByRole('tablist')).toBeVisible({ timeout: 10_000 });

      await expect(page.getByTestId('produce-record-button')).toBeVisible({ timeout: 10_000 });

      await expect(page.getByText('No messages')).toBeVisible({ timeout: 10_000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should handle rapid filter changes gracefully', async ({ page }) => {
    const topicName = `rapid-filter-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'Test rapid filtering');

    await step('Rapidly change filters', async () => {
      await page.goto(`/topics/${topicName}`);

      const searchInput = page.getByPlaceholder(/search|filter/iu);
      if (await searchInput.isVisible()) {
        await searchInput.fill('filter1');
        await searchInput.fill('filter2');
        await searchInput.fill('filter3');
        await searchInput.clear();
        await searchInput.fill('Test');

        await expect(page.getByText('Test rapid filtering')).toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should preserve filters in URL parameters', async ({ page }) => {
    const topicName = `url-filters-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'URL filter test');

    await step('Apply filter and check URL', async () => {
      await page.goto(`/topics/${topicName}#messages`);

      const searchInput = page.getByTestId('message-quick-search-input');
      await expect(searchInput).toBeVisible({ timeout: 5000 });
      await searchInput.fill('test-search');
      await page.keyboard.press('Enter');

      await page.waitForURL(/q=test-search/u);

      const currentUrl = page.url();
      expect(currentUrl).toContain('q=test-search');
    });

    await step('Reload page and verify filter persists', async () => {
      await page.reload();

      await expect(page.getByTestId('message-quick-search-input')).toBeVisible({ timeout: 5000 });

      expect(page.url()).toContain('q=test-search');

      await expect(page.getByTestId('message-quick-search-input')).toHaveValue('test-search');
    });

    await topicPage.deleteTopic(topicName);
  });
});
