import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test.use({
  permissions: ['clipboard-write', 'clipboard-read'],
});

test.describe('Topic', () => {
  test('should create a message that exceeds the display limit, checks that the exceed limit message appears', async ({
    page,
  }) => {
    const topicName = `too-big-message-test-${randomUUID()}`;

    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();
    await page.getByTestId('topic-name').fill(topicName);
    await page.getByTestId('onOk-button').click();
    await page.goto(`/topics/${topicName}/produce-record`);

    // const DefaultMaxDeserializationPayloadSize = 20_480 // 20 KB
    const maxMessageSize = 30000;
    const fillText = 'example content ';
    const content = fillText.repeat(maxMessageSize / fillText.length + 1);

    const monacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').nth(0);
    await monacoEditor.click();
    await page.evaluate(`navigator.clipboard.writeText("${content}")`);

    // let's paste this on both Mac + Linux. proper way in the future is to identify platform first.
    await page.keyboard.press('Control+KeyV');
    await page.keyboard.press('Meta+KeyV');

    await page.getByTestId('produce-button').click();

    await page.getByText('Message size exceeds the display limit.').waitFor({
      state: 'visible',
      timeout: 5000,
    });

    await page.getByTestId('data-table-cell').nth(0).getByRole('button').click();
    await page
      .getByText('Because this message size exceeds the display limit, loading it could cause performance degradation.')
      .waitFor({
        state: 'visible',
      });

    await page.getByTestId('load-anyway-button').click();
    await page.getByTestId('payload-content').getByText(content).waitFor({
      state: 'visible',
    });

    // cleanup, let's delete the topic now
    await page.goto('/topics');
    await page.getByTestId(`delete-topic-button-${topicName}`).click();
    await page.getByTestId('delete-topic-confirm-button').click();
  });

  test('should show internal topics if the corresponding checkbox is checked', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('show-internal-topics-checkbox').check();
    await expect(page.getByTestId('data-table-cell').getByText('_schemas')).toBeVisible();
  });

  test('should hide internal topics if the corresponding checkbox is unchecked', async ({ page }) => {
    await page.goto('/topics');
    await page.getByTestId('show-internal-topics-checkbox').uncheck();
    await expect(page.getByTestId('data-table-cell').getByText('_schemas')).not.toBeVisible();
  });

  test('should create a topic, produce a message, export it as CSV format and delete a topic', async ({ page }) => {
    const topicName = `test-topic-${Date.now()}`;

    await page.goto('/topics');

    await test.step('Create topic', async () => {
      await page.getByTestId('create-topic-button').click();
      await page.getByTestId('topic-name').fill(topicName);
      await page.getByTestId('onOk-button').click();
      await page.getByRole('button', { name: 'Close' }).click(); // Close success dialog
      await expect(page.getByRole('link', { name: topicName })).toBeVisible();
    });

    await test.step('Produce message', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);
      const valueMonacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueMonacoEditor.click(); // Focus the editor
      await page.keyboard.insertText('hello world');
      await page.getByTestId('produce-button').click();
      const messageValueCell = page.getByRole('cell', { name: /hello world/i }).first();
      await expect(messageValueCell).toBeVisible();
    });

    await test.step('Export message as CSV', async () => {
      await page.getByLabel('Collapse row').click();
      await page.getByText('Download Record').click();
      await page.getByTestId('csv_field').click();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('dialog', { name: 'Save Message' }).getByRole('button', { name: 'Save Messages' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch('messages.csv');
      const tempFilePath = `/tmp/downloaded-${download.suggestedFilename()}`;
      await download.saveAs(tempFilePath);
      const fileContent = fs.readFileSync(tempFilePath, 'utf-8');
      expect(fileContent).toContain('hello world');
      fs.unlinkSync(tempFilePath); // Clean up
    });

    await test.step('Delete topic', async () => {
      await page.goto('/topics');
      await expect(page.getByRole('link', { name: topicName })).toBeVisible(); // Re-verify topic before delete
      await page.getByTestId(`delete-topic-button-${topicName}`).click();
      await page.getByTestId('delete-topic-confirm-button').click();
      await expect(page.getByText('Topic Deleted')).toBeVisible();
      await expect(page.getByRole('link', { name: topicName })).not.toBeVisible();
    });
  });

  test('should create topic, produce message, copy value to clipboard, and delete topic', async ({ page }) => {
    const topicName = `test-topic-clipboard-${Date.now()}`;
    const messageValue = 'hello clipboard test';

    await page.goto('/topics');

    await test.step('Create topic', async () => {
      await page.getByTestId('create-topic-button').click();
      await page.getByTestId('topic-name').fill(topicName);
      await page.getByTestId('onOk-button').click();
      await page.getByRole('button', { name: 'Close' }).click(); // Close success dialog
      await expect(page.getByRole('link', { name: topicName })).toBeVisible();
    });

    await test.step('Produce message', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);
      const valueMonacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueMonacoEditor.click(); // Focus the editor
      await page.keyboard.insertText(messageValue);
      await page.getByTestId('produce-button').click();
      const messageValueCell = page.getByRole('cell', { name: new RegExp(messageValue, 'i') }).first();
      await expect(messageValueCell).toBeVisible();
    });

    await test.step('Copy message value to clipboard', async () => {
      await page.getByLabel('Collapse row').first().click();
      // Assuming a button with text like 'Copy value' or an aria-label containing 'Copy value'
      await page.getByRole('button', { name: /copy value/i }).click();
    });

    await test.step('Verify clipboard content', async () => {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBe(messageValue);

      await expect(page.getByText('Value copied to clipboard')).toBeVisible({ timeout: 2000 });
    });

    await test.step('Delete topic', async () => {
      await page.goto('/topics');
      await expect(page.getByRole('link', { name: topicName })).toBeVisible(); // Re-verify topic before delete
      await page.getByTestId(`delete-topic-button-${topicName}`).click();
      await page.getByTestId('delete-topic-confirm-button').click();
      await expect(page.getByText('Topic Deleted')).toBeVisible();
      await expect(page.getByRole('link', { name: topicName })).not.toBeVisible();
    });
  });

  test('should search for topics using the search input', async ({ page }) => {
    const topicName = `search-test-topic-${Date.now()}`;

    await page.goto('/topics');

    await test.step('Create a test topic', async () => {
      await page.getByTestId('create-topic-button').click();
      await page.getByTestId('topic-name').fill(topicName);
      await page.getByTestId('onOk-button').click();
      await page.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('link', { name: topicName })).toBeVisible();
    });

    await test.step('Search for the topic', async () => {
      const searchInput = page.getByPlaceholder('Enter search term/regex');
      await searchInput.fill(topicName);
      await expect(page.getByRole('link', { name: topicName })).toBeVisible();
      
      // Search for non-existent topic
      await searchInput.fill('non-existent-topic-12345');
      await expect(page.getByRole('link', { name: topicName })).not.toBeVisible();
      
      // Clear search and verify topic appears again
      await searchInput.clear();
      await expect(page.getByRole('link', { name: topicName })).toBeVisible();
    });

    await test.step('Cleanup', async () => {
      await page.getByTestId(`delete-topic-button-${topicName}`).click();
      await page.getByTestId('delete-topic-confirm-button').click();
      await expect(page.getByText('Topic Deleted')).toBeVisible();
    });
  });

  test('should create multiple topics and verify they appear in the list', async ({ page }) => {
    const topic1 = `multi-topic-test-1-${Date.now()}`;
    const topic2 = `multi-topic-test-2-${Date.now()}`;

    await page.goto('/topics');

    await test.step('Create first topic', async () => {
      await page.getByTestId('create-topic-button').click();
      await page.getByTestId('topic-name').fill(topic1);
      await page.getByTestId('onOk-button').click();
      await page.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('link', { name: topic1 })).toBeVisible();
    });

    await test.step('Create second topic', async () => {
      await page.getByTestId('create-topic-button').click();
      await page.getByTestId('topic-name').fill(topic2);
      await page.getByTestId('onOk-button').click();
      await page.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('link', { name: topic2 })).toBeVisible();
    });

    await test.step('Verify both topics are visible', async () => {
      await expect(page.getByRole('link', { name: topic1 })).toBeVisible();
      await expect(page.getByRole('link', { name: topic2 })).toBeVisible();
    });

    await test.step('Cleanup', async () => {
      await page.getByTestId(`delete-topic-button-${topic1}`).click();
      await page.getByTestId('delete-topic-confirm-button').click();
      await page.getByTestId(`delete-topic-button-${topic2}`).click();
      await page.getByTestId('delete-topic-confirm-button').click();
    });
  });

  test('should navigate to topic details and view topic information', async ({ page }) => {
    const topicName = `details-test-topic-${Date.now()}`;

    await page.goto('/topics');

    await test.step('Create test topic', async () => {
      await page.getByTestId('create-topic-button').click();
      await page.getByTestId('topic-name').fill(topicName);
      await page.getByTestId('onOk-button').click();
      await page.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('link', { name: topicName })).toBeVisible();
    });

    await test.step('Navigate to topic details', async () => {
      await page.getByRole('link', { name: topicName }).click();
      await expect(page).toHaveURL(new RegExp(`/topics/${topicName}`));
      
      // Verify we're on the topic details page
      await expect(page.getByText(topicName)).toBeVisible();
    });

    await test.step('Navigate back to topics list', async () => {
      await page.getByRole('link', { name: 'Topics' }).first().click();
      await expect(page).toHaveURL(/\/topics/);
      await expect(page.getByRole('link', { name: topicName })).toBeVisible();
    });

    await test.step('Cleanup', async () => {
      await page.getByTestId(`delete-topic-button-${topicName}`).click();
      await page.getByTestId('delete-topic-confirm-button').click();
      await expect(page.getByText('Topic Deleted')).toBeVisible();
    });
  });

  test('should produce multiple messages and verify they appear in the topic', async ({ page }) => {
    const topicName = `multi-message-test-${Date.now()}`;
    const messages = ['first message', 'second message', 'third message'];

    await page.goto('/topics');

    await test.step('Create test topic', async () => {
      await page.getByTestId('create-topic-button').click();
      await page.getByTestId('topic-name').fill(topicName);
      await page.getByTestId('onOk-button').click();
      await page.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('link', { name: topicName })).toBeVisible();
    });

    await test.step('Produce multiple messages', async () => {
      for (const message of messages) {
        await page.goto(`/topics/${topicName}/produce-record`);
        const valueMonacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
        await valueMonacoEditor.click();
        await page.keyboard.insertText(message);
        await page.getByTestId('produce-button').click();
        
        // Verify message was produced
        const messageValueCell = page.getByRole('cell', { name: new RegExp(message, 'i') }).first();
        await expect(messageValueCell).toBeVisible();
      }
    });

    await test.step('Verify all messages are visible in topic', async () => {
      await page.goto(`/topics/${topicName}`);
      
      for (const message of messages) {
        await expect(page.getByText(message)).toBeVisible();
      }
    });

    await test.step('Cleanup', async () => {
      await page.goto('/topics');
      await page.getByTestId(`delete-topic-button-${topicName}`).click();
      await page.getByTestId('delete-topic-confirm-button').click();
      await expect(page.getByText('Topic Deleted')).toBeVisible();
    });
  });

  test('should handle topic creation with validation errors', async ({ page }) => {
    await page.goto('/topics');

    await test.step('Test empty topic name validation', async () => {
      await page.getByTestId('create-topic-button').click();
      
      // The create button should be disabled when topic name is empty
      const createButton = page.getByTestId('onOk-button');
      await expect(createButton).toBeDisabled();
      
      // Modal should still be open
      await expect(page.getByTestId('topic-name')).toBeVisible();
    });

    await test.step('Test invalid topic name characters', async () => {
      await page.getByTestId('topic-name').fill('invalid topic name with spaces!');
      
      // Button might be enabled but should show validation error on submit
      const createButton = page.getByTestId('onOk-button');
      if (await createButton.isEnabled()) {
        await createButton.click();
        // Should either show validation error or prevent submission
        await expect(page.getByTestId('topic-name')).toBeVisible();
      }
    });

    await test.step('Cancel topic creation', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByTestId('create-topic-button')).toBeVisible();
    });
  });

  
});
