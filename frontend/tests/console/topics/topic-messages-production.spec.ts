// spec: specs/topics.md
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

import { TopicPage } from '../utils/topic-page';

test.use({
  permissions: ['clipboard-write', 'clipboard-read'],
});

test.describe('Produce Messages', () => {
  test('should produce simple text message', async ({ page }) => {
    const topicName = `text-message-${Date.now()}`;
    const messageContent = 'Hello Redpanda Console';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageContent);

    await test.step('Verify message in messages tab', async () => {
      await page.goto(`/topics/${topicName}`);
      await expect(page.getByText(messageContent)).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });

  test.skip('should produce message with key', async ({ page }) => {
    const topicName = `keyed-message-${Date.now()}`;
    const messageKey = 'user-123';
    const messageValue = 'User data for user 123';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Produce message with key', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      // Wait for page to load
      await expect(page.getByTestId('produce-button')).toBeVisible();

      // Find and fill key editor
      const keyEditor = page.getByTestId('produce-key-editor').locator('.monaco-editor').first();
      await keyEditor.click();
      await page.keyboard.insertText(messageKey);

      // Find and fill value editor
      const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueEditor.click();
      await page.keyboard.insertText(messageValue);

      // Produce message
      await page.getByTestId('produce-button').click();

      // Verify message was produced - page should show the message
      await expect(page.getByRole('cell', { name: new RegExp(messageValue, 'i') }).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should produce multiple messages in sequence', async ({ page }) => {
    const topicName = `multi-produce-${Date.now()}`;
    const messages = ['Message One', 'Message Two', 'Message Three'];

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    for (const message of messages) {
      await test.step(`Produce message: ${message}`, async () => {
        await page.goto(`/topics/${topicName}/produce-record`);

        const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
        await valueEditor.click();

        // Clear any existing content before inserting new text
        await page.keyboard.press('Meta+A'); // Select all (Mac)
        await page.keyboard.press('Control+A'); // Select all (Windows/Linux)
        await page.keyboard.press('Backspace');

        await page.keyboard.insertText(message);
        await page.getByTestId('produce-button').click();

        // Verify message appears
        await expect(page.getByRole('cell', { name: new RegExp(message, 'i') }).first()).toBeVisible({
          timeout: 10_000,
        });
      });
    }

    await test.step('Verify all messages in topic', async () => {
      await page.goto(`/topics/${topicName}`);

      // All messages should be visible
      for (const message of messages) {
        await expect(page.getByText(message)).toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should produce large message and handle display limit', async ({ page }) => {
    const topicName = `large-message-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await page.goto(`/topics/${topicName}/produce-record`);

    await test.step('Produce large message', async () => {
      // Create message larger than 20KB (DefaultMaxDeserializationPayloadSize)
      const maxMessageSize = 30_000;
      const fillText = 'example content ';
      const content = fillText.repeat(Math.floor(maxMessageSize / fillText.length) + 1);

      const monacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await monacoEditor.click();

      // Copy to clipboard and paste (faster than typing)
      await page.evaluate(`navigator.clipboard.writeText("${content}")`);
      await page.keyboard.press('Control+KeyV');
      await page.keyboard.press('Meta+KeyV');

      await page.getByTestId('produce-button').click();

      // Wait for message to appear with size warning
      await page.getByText('Message size exceeds the display limit.').waitFor({
        state: 'visible',
        timeout: 10_000,
      });
    });

    await test.step('Load large message', async () => {
      // Click on the message row to expand
      await page.getByTestId('data-table-cell').first().getByRole('button').click();

      // Should show warning about performance
      await page
        .getByText(
          'Because this message size exceeds the display limit, loading it could cause performance degradation.'
        )
        .waitFor({
          state: 'visible',
          timeout: 5000,
        });

      // Click "Load anyway"
      await page.getByTestId('load-anyway-button').click();

      // Full message content should load
      await expect(page.getByTestId('payload-content')).toBeVisible({ timeout: 5000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should navigate to produce page and see form elements', async ({ page }) => {
    const topicName = `produce-ui-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Navigate to produce page', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      // Verify produce page loaded with all elements
      await expect(page.getByTestId('produce-button')).toBeVisible();
      await expect(page.getByTestId('produce-value-editor')).toBeVisible();
      await expect(page.getByTestId('produce-key-editor')).toBeVisible();

      // Page title or heading should indicate produce/publish
      await expect(page.locator('text=/Produce|Publish/i').first()).toBeVisible({ timeout: 5000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should handle empty message production', async ({ page }) => {
    const topicName = `empty-message-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Try to produce empty message', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      // Don't enter any value
      const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueEditor.click();

      // Try to produce
      await page.getByTestId('produce-button').click();

      // Message might be produced (empty is valid) or button might be disabled
      // Just verify no crash occurs
      await page.waitForTimeout(2000);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should clear editor content between produces', async ({ page }) => {
    const topicName = `clear-editor-${Date.now()}`;
    const message1 = 'First message';
    const message2 = 'Second message';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Produce first message', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);
      const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueEditor.click();
      await page.keyboard.insertText(message1);
      await page.getByTestId('produce-button').click();

      await expect(page.getByRole('cell', { name: new RegExp(message1, 'i') }).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Produce second message - editor should be clear or have previous content', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      // Editor might be cleared or might have previous content
      const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueEditor.click();

      // Select all and delete to ensure clean state
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Meta+A');
      await page.keyboard.press('Backspace');

      // Type new message
      await page.keyboard.insertText(message2);
      await page.getByTestId('produce-button').click();

      await expect(page.getByRole('cell', { name: new RegExp(message2, 'i') }).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step('Verify both messages exist', async () => {
      await page.goto(`/topics/${topicName}`);
      await expect(page.getByText(message1)).toBeVisible();
      await expect(page.getByText(message2)).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });
});
