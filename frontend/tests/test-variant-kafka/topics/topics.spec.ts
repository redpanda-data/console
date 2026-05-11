import { expect, test } from '@playwright/test';

import { TopicPage } from '../../test-variant-console/utils/topic-page';

test.describe('Topics - Apache Kafka backend', () => {
  test('should load the topics list', async ({ page }) => {
    const topicPage = new TopicPage(page);
    await topicPage.goToTopicsList();

    await expect(page.getByTestId('topics-table')).toBeVisible();
  });

  test('should create and delete a topic', async ({ page }) => {
    const topicPage = new TopicPage(page);
    const topicName = `kafka-e2e-${Date.now()}`;

    await topicPage.createTopic(topicName);
    await topicPage.verifyTopicInList(topicName);
    await topicPage.deleteTopic(topicName);
    await topicPage.verifyTopicNotInList(topicName);
  });

  test('should search for a topic by name', async ({ page }) => {
    const topicPage = new TopicPage(page);
    const topicName = `kafka-search-${Date.now()}`;

    await topicPage.createTopic(topicName);
    await topicPage.searchTopics(topicName);
    await topicPage.verifyTopicInList(topicName);

    await topicPage.deleteTopic(topicName);
  });
});
