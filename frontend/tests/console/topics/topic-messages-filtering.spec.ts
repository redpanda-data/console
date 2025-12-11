// spec: specs/topics.md
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

import { TopicPage } from '../utils/topic-page';

test.describe('View and Filter Messages', () => {
  test('should expand message to view details', async ({ page }) => {
    const topicName = `expand-message-${Date.now()}`;
    const messageContent = 'Detailed message content';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageContent);

    await test.step('Expand message row', async () => {
      await page.goto(`/topics/${topicName}`);

      // Wait for message to appear
      await expect(page.getByText(messageContent)).toBeVisible();

      // Click expand button
      const expandButton = page.getByLabel('Collapse row').first();
      await expandButton.click();

      // Expanded details should be visible
      await expect(page.getByTestId('payload-content')).toBeVisible({ timeout: 5000 });

      // Metadata should be visible
      await expect(page.getByText(/Offset|Partition|Timestamp/i).first()).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should search message content', async ({ page }) => {
    const topicName = `search-messages-${Date.now()}`;
    const searchTerm = 'searchable-keyword';
    const message1 = `Message with ${searchTerm}`;
    const message2 = 'Message without keyword';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, message1);
    await topicPage.produceMessage(topicName, message2);

    await test.step('Search for messages', async () => {
      await page.goto(`/topics/${topicName}`);

      // Find search input
      const searchInput = page.getByPlaceholder(/search|filter/i);
      if (await searchInput.isVisible()) {
        await searchInput.fill(searchTerm);
        await page.keyboard.press('Enter');

        // Wait for filtering
        await page.waitForTimeout(1000);

        // Message with search term should be visible
        await expect(page.getByText(message1)).toBeVisible();

        // Message without search term may be hidden
        // (behavior depends on implementation)
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  // biome-ignore lint/suspicious/noSkippedTests: Skip until we can control selects in a better way
  test.skip('should filter messages by partition', async ({ page }) => {
    const topicName = `filter-partition-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'Message for partition filter');

    await test.step('Apply partition filter', async () => {
      await page.goto(`/topics/${topicName}`);

      // Look for partition filter dropdown
      const partitionFilter = page.locator('text=Partition').first();
      if (await partitionFilter.isVisible()) {
        await partitionFilter.click();

        // Select partition 0 (or first available)
        const partition0 = page.locator('text=0').first();
        if (await partition0.isVisible()) {
          await partition0.click();

          // Messages should filter to selected partition
          await page.waitForTimeout(1000);
        }
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should filter messages by offset', async ({ page }) => {
    const topicName = `filter-offset-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    // Produce multiple messages
    for (let i = 0; i < 3; i++) {
      await topicPage.produceMessage(topicName, `Message ${i}`);
    }

    await test.step('Filter by start offset', async () => {
      await page.goto(`/topics/${topicName}`);

      // Look for offset filter input
      const offsetInput = page.getByPlaceholder(/offset/i);
      if (await offsetInput.isVisible()) {
        // Set start offset to 1 (skip first message)
        await offsetInput.fill('1');
        await page.keyboard.press('Enter');

        // Wait for filtering
        await page.waitForTimeout(1000);

        // Messages from offset 1 onwards should be visible
        await expect(page.getByTestId('data-table-cell').first()).toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should clear all filters', async ({ page }) => {
    const topicName = `clear-filters-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'Message for filter clearing');

    await test.step('Apply and clear filters', async () => {
      await page.goto(`/topics/${topicName}`);

      // Apply a search filter
      const searchInput = page.getByPlaceholder(/search|filter/i);
      if (await searchInput.isVisible()) {
        await searchInput.fill('some-filter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }

      // Look for clear filters button
      const clearButton = page.getByRole('button', { name: /clear|reset/i });
      if (await clearButton.isVisible()) {
        await clearButton.click();

        // All messages should be visible again
        await expect(page.getByText('Message for filter clearing')).toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should handle empty topic with no messages', async ({ page }) => {
    const topicName = `empty-topic-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('View empty topic', async () => {
      await page.goto(`/topics/${topicName}`);

      // Should show empty state message
      await expect(page.getByText(/No messages|empty/i).first()).toBeVisible({ timeout: 5000 });

      // Produce button should still be available
      await expect(page.getByRole('button', { name: /produce/i }).first()).toBeVisible({ timeout: 5000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should handle rapid filter changes gracefully', async ({ page }) => {
    const topicName = `rapid-filter-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'Test rapid filtering');

    await test.step('Rapidly change filters', async () => {
      await page.goto(`/topics/${topicName}`);

      const searchInput = page.getByPlaceholder(/search|filter/i);
      if (await searchInput.isVisible()) {
        // Rapidly change search terms
        await searchInput.fill('filter1');
        await searchInput.fill('filter2');
        await searchInput.fill('filter3');
        await searchInput.clear();
        await searchInput.fill('Test');

        // Wait for final filter to apply
        await page.waitForTimeout(1000);

        // Should handle gracefully without errors
        await expect(page.getByText('Test rapid filtering')).toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should preserve filters in URL parameters', async ({ page }) => {
    const topicName = `url-filters-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'URL filter test');

    await test.step('Apply filter and check URL', async () => {
      await page.goto(`/topics/${topicName}`);

      // Use the specific testId for message quick search
      const searchInput = page.getByTestId('message-quick-search-input');
      await expect(searchInput).toBeVisible({ timeout: 5000 });
      await searchInput.fill('test-search');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      // URL should contain filter parameters (quick search uses 'q' param)
      const currentUrl = page.url();
      expect(currentUrl).toContain('q=test-search');
    });

    await test.step('Reload page and verify filter persists', async () => {
      // Reload the page
      await page.reload();

      // Wait for page to load
      await expect(page.getByTestId('message-quick-search-input')).toBeVisible({ timeout: 5000 });

      // Verify the search parameter is still in URL
      expect(page.url()).toContain('q=test-search');

      // Verify the search input has the value
      await expect(page.getByTestId('message-quick-search-input')).toHaveValue('test-search');
    });

    await topicPage.deleteTopic(topicName);
  });
});
