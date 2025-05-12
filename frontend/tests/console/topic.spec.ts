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
});
