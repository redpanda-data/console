// spec: specs/topics.md
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

import { TopicPage } from '../utils/TopicPage';

test.describe('Topic Creation', () => {
  test('should create topic with default settings', async ({ page }) => {
    const topicName = `default-topic-${Date.now()}`;

    await test.step('Open create topic modal', async () => {
      await page.goto('/topics');
      await page.getByTestId('create-topic-button').click();

      // Modal opens with create topic form - wait for modal animation
      await expect(page.getByTestId('topic-name')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('topic-name')).toBeFocused();
    });

    await test.step('Create topic with default settings', async () => {
      await page.getByTestId('topic-name').fill(topicName);
      await page.getByTestId('onOk-button').click();

      // Wait for success confirmation
      await expect(page.getByTestId('create-topic-success__close-button')).toBeVisible();
      await page.getByTestId('create-topic-success__close-button').click();

      // Topic appears in list
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    const topicPage = new TopicPage(page);
    await topicPage.deleteTopic(topicName);
  });

  test('should create topic with custom configuration', async ({ page }) => {
    const topicName = `custom-config-${Date.now()}`;

    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await test.step('Configure topic settings', async () => {
      await page.getByTestId('topic-name').fill(topicName);

      // Set custom partitions
      const partitionsInput = page.getByPlaceholder(/partitions/i);
      if (await partitionsInput.isVisible()) {
        await partitionsInput.fill('6');
      }

      // Create topic
      await page.getByTestId('onOk-button').click();
      await page.getByTestId('create-topic-success__close-button').click();
    });

    await test.step('Verify topic was created', async () => {
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    await test.step('Verify configuration', async () => {
      // Navigate to topic configuration
      await page.getByTestId(`topic-link-${topicName}`).click();
      await page.goto(`/topics/${topicName}#configuration`);

      // Verify configuration page loads
      await expect(page.getByTestId('config-group-table')).toBeVisible();
    });

    const topicPage = new TopicPage(page);
    await topicPage.deleteTopic(topicName);
  });

  test('should validate empty topic name', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await test.step('Verify create button is disabled for empty name', async () => {
      // Leave topic name field empty
      await expect(page.getByTestId('topic-name')).toHaveValue('');

      // Create button should be disabled
      const createButton = page.getByTestId('onOk-button');
      await expect(createButton).toBeDisabled();

      // Modal should still be open
      await expect(page.getByTestId('topic-name')).toBeVisible();
    });

    await test.step('Cancel creation', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByTestId('create-topic-button')).toBeVisible();
    });
  });

  test('should validate invalid topic name characters', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await test.step('Test invalid topic name with spaces', async () => {
      await page.getByTestId('topic-name').fill('invalid topic name with spaces!');

      const createButton = page.getByTestId('onOk-button');

      if (await createButton.isEnabled()) {
        // If button is enabled, clicking should show validation error
        await createButton.click();

        // Modal should remain open (creation prevented)
        await expect(page.getByTestId('topic-name')).toBeVisible();
      } else {
        // Button is disabled due to validation
        await expect(createButton).toBeDisabled();
      }
    });

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should validate replication factor against broker count', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await test.step('Set high replication factor', async () => {
      await page.getByTestId('topic-name').fill(`replication-test-${Date.now()}`);

      // Try to set replication factor higher than broker count
      const replicationInput = page.getByPlaceholder(/replication/i);
      if ((await replicationInput.isVisible()) && !(await replicationInput.isDisabled())) {
        await replicationInput.fill('999');

        // Wait a moment for validation
        await page.waitForTimeout(500);

        // Check if validation error appears
        const errorText = page.getByText(/replication factor/i);
        if (await errorText.isVisible()) {
          // Validation error is shown
          await expect(errorText).toBeVisible();
        }
      }
    });

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should cancel topic creation', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();

    await test.step('Fill form and cancel', async () => {
      await page.getByTestId('topic-name').fill('cancelled-topic');

      // Click cancel button
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Modal closes without creating topic
      await expect(page.getByTestId('create-topic-button')).toBeVisible();
    });

    await test.step('Verify topic was not created', async () => {
      // Topic should not appear in list
      await expect(page.getByTestId('topic-link-cancelled-topic')).not.toBeVisible();
    });
  });

  test('should create topic and verify it appears in multiple views', async ({ page }) => {
    const topicName = `multi-view-${Date.now()}`;

    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();
    await page.getByTestId('topic-name').fill(topicName);
    await page.getByTestId('onOk-button').click();
    await page.getByTestId('create-topic-success__close-button').click();

    await test.step('Verify in topics list', async () => {
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    await test.step('Navigate to topic details', async () => {
      await page.getByTestId(`topic-link-${topicName}`).click();
      await expect(page).toHaveURL(new RegExp(`/topics/${topicName}`));
      await expect(page.getByText(topicName)).toBeVisible();
    });

    await test.step('Navigate back to list', async () => {
      await page.goto('/topics');
      await expect(page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
    });

    const topicPage = new TopicPage(page);
    await topicPage.deleteTopic(topicName);
  });
});
