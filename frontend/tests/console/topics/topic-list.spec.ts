// spec: specs/topics.md
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

import { TopicPage } from '../utils/topic-page';

test.describe('Topic List - Basic Operations', () => {
  test('should view topics list with all elements visible', async ({ page }) => {
    const topicPage = new TopicPage(page);
    await topicPage.goToTopicsList();

    // Verify page loaded and basic elements are visible
    await expect(page.getByTestId('search-field-input')).toBeVisible();
    await expect(page.getByTestId('show-internal-topics-checkbox')).toBeVisible();

    // Verify data table is present
    await expect(page.getByTestId('topics-table')).toBeVisible();
  });

  test('should search topics with exact match', async ({ page }) => {
    const topicPage = new TopicPage(page);
    const topicName = `search-exact-${Date.now()}`;

    await topicPage.createTopic(topicName);

    await test.step('Search for the created topic', async () => {
      await topicPage.searchTopics(topicName);

      // Topic should be visible
      await topicPage.verifyTopicInList(topicName);

      // Search for non-existent topic
      await topicPage.searchTopics('non-existent-topic-xyz-12345');
      await topicPage.verifyTopicNotInList(topicName);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should search topics with regex pattern', async ({ page }) => {
    const topicPage = new TopicPage(page);
    const prefix = `regex-test-${Date.now()}`;
    const topic1 = `${prefix}-alpha`;
    const topic2 = `${prefix}-beta`;
    const topic3 = `other-topic-${Date.now()}`;

    await topicPage.createTopic(topic1);
    await topicPage.createTopic(topic2);
    await topicPage.createTopic(topic3);

    await test.step('Search with regex pattern', async () => {
      // Search for topics starting with prefix using regex
      await topicPage.searchTopics(`^${prefix}.*`);

      // Both matching topics should be visible
      await topicPage.verifyTopicInList(topic1);
      await topicPage.verifyTopicInList(topic2);

      // Non-matching topic should not be visible
      await topicPage.verifyTopicNotInList(topic3);
    });

    await topicPage.deleteTopic(topic1);
    await topicPage.deleteTopic(topic2);
    await topicPage.deleteTopic(topic3);
  });

  test('should clear search filter and show all topics', async ({ page }) => {
    const topicPage = new TopicPage(page);
    const topicName = `clear-search-${Date.now()}`;

    await topicPage.createTopic(topicName);

    await test.step('Apply and clear search filter', async () => {
      // Apply search filter
      await topicPage.searchTopics('non-matching-search-term');
      await topicPage.verifyTopicNotInList(topicName);

      // Clear search filter
      await topicPage.clearSearch();

      // Topic should be visible again
      await topicPage.verifyTopicInList(topicName);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should toggle show internal topics checkbox', async ({ page }) => {
    const topicPage = new TopicPage(page);
    await topicPage.goToTopicsList();

    await test.step('Hide internal topics', async () => {
      await topicPage.toggleInternalTopics(false);

      // Internal topics (starting with _) should be hidden
      await expect(page.getByTestId('data-table-cell').getByText('_schemas')).not.toBeVisible();
    });

    await test.step('Show internal topics', async () => {
      await topicPage.toggleInternalTopics(true);

      // Internal topics should be visible
      await expect(page.getByTestId('data-table-cell').getByText('_schemas')).toBeVisible();
    });
  });

  test('should persist internal topics visibility setting across page reloads', async ({ page }) => {
    const topicPage = new TopicPage(page);
    await topicPage.goToTopicsList();

    await test.step('Set internal topics to visible', async () => {
      await topicPage.toggleInternalTopics(true);
      await expect(page.getByTestId('data-table-cell').getByText('_schemas')).toBeVisible();
    });

    await test.step('Reload page and verify setting persists', async () => {
      await page.reload();

      // Setting should persist - internal topics still visible
      await expect(page.getByTestId('show-internal-topics-checkbox')).toBeChecked();
      await expect(page.getByTestId('data-table-cell').getByText('_schemas')).toBeVisible();
    });

    await test.step('Hide internal topics and verify persistence', async () => {
      await topicPage.toggleInternalTopics(false);
      await page.reload();

      // Setting should persist - internal topics still hidden
      await expect(page.getByTestId('show-internal-topics-checkbox')).not.toBeChecked();
      await expect(page.getByTestId('data-table-cell').getByText('_schemas')).not.toBeVisible();
    });
  });
});
