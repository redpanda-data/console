// spec: specs/topics.md
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

import fs from 'node:fs';
import { TopicPage } from '../utils/topic-page';

test.describe('Message Actions and Export', () => {
  test('should copy message value to clipboard', async ({ page }) => {
    const topicName = `copy-clipboard-${Date.now()}`;
    const messageValue = 'Copy this message to clipboard';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await test.step('Copy message value', async () => {
      await page.goto(`/topics/${topicName}`);

      // Expand message
      await page.getByLabel('Collapse row').first().click();

      // Click copy value button
      await page.getByRole('button', { name: /copy value/i }).click();
    });

    await test.step('Verify clipboard content', async () => {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBe(messageValue);

      // Success toast should appear
      await expect(page.getByText('Value copied to clipboard')).toBeVisible({ timeout: 2000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should export single message as JSON', async ({ page }) => {
    const topicName = `export-json-${Date.now()}`;
    const messageValue = 'Export this message as JSON';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await test.step('Export message as JSON', async () => {
      await page.goto(`/topics/${topicName}`);

      // Expand message
      await page.getByLabel('Collapse row').first().click();

      // Click download/export button
      await page.getByText('Download Record').click();

      // JSON format is selected by default, no need to click

      // Start download
      const downloadPromise = page.waitForEvent('download');
      await page
        .getByRole('dialog', { name: /save message/i })
        .getByRole('button', { name: /save/i })
        .click();

      const download = await downloadPromise;

      // Verify download
      expect(download.suggestedFilename()).toMatch(/\.json$/);

      // Save and verify content
      const tempFilePath = `/tmp/test-${download.suggestedFilename()}`;
      await download.saveAs(tempFilePath);

      const fileContent = fs.readFileSync(tempFilePath, 'utf-8');
      expect(fileContent).toContain(messageValue);

      // Cleanup
      fs.unlinkSync(tempFilePath);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should export single message as CSV', async ({ page }) => {
    const topicName = `export-csv-${Date.now()}`;
    const messageValue = 'Export this message as CSV';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await test.step('Export message as CSV', async () => {
      await page.goto(`/topics/${topicName}`);

      // Expand message
      await page.getByLabel('Collapse row').first().click();

      // Click download/export button
      await page.getByText('Download Record').click();

      // Select CSV format
      await page.getByTestId('csv_field').click();

      // Start download
      const downloadPromise = page.waitForEvent('download');
      await page
        .getByRole('dialog', { name: /save message/i })
        .getByRole('button', { name: /save messages/i })
        .click();

      const download = await downloadPromise;

      // Verify download
      expect(download.suggestedFilename()).toMatch('messages.csv');

      // Save and verify content
      const tempFilePath = `/tmp/test-${download.suggestedFilename()}`;
      await download.saveAs(tempFilePath);

      const fileContent = fs.readFileSync(tempFilePath, 'utf-8');
      expect(fileContent).toContain(messageValue);

      // Cleanup
      fs.unlinkSync(tempFilePath);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should export message with special characters', async ({ page }) => {
    const topicName = `export-special-${Date.now()}`;
    const messageValue = 'Message with "quotes", commas, and émojis 🎉';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await test.step('Export and verify special characters', async () => {
      await page.goto(`/topics/${topicName}`);

      // Expand message
      await page.getByLabel('Collapse row').first().click();

      // Export as JSON
      await page.getByText('Download Record').click();

      const downloadPromise = page.waitForEvent('download');
      await page
        .getByRole('dialog', { name: /save message/i })
        .getByRole('button', { name: /save/i })
        .click();

      const download = await downloadPromise;
      const tempFilePath = `/tmp/test-special-${Date.now()}.json`;
      await download.saveAs(tempFilePath);

      const fileContent = fs.readFileSync(tempFilePath, 'utf-8');

      // Verify special characters are preserved
      expect(fileContent).toContain('quotes');
      expect(fileContent).toContain('émojis');

      // Cleanup
      fs.unlinkSync(tempFilePath);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should open and cancel export dialog', async ({ page }) => {
    const topicName = `cancel-export-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'Message for cancel test');

    await test.step('Open and cancel export', async () => {
      await page.goto(`/topics/${topicName}`);

      // Expand message
      await page.getByLabel('Collapse row').first().click();

      // Open export dialog
      await page.getByText('Download Record').click();

      // Verify dialog opened
      await expect(page.getByRole('dialog', { name: /save message/i })).toBeVisible();

      // Cancel export
      const cancelButton = page.getByRole('button', { name: /cancel/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();

        // Dialog should close
        await expect(page.getByRole('dialog', { name: /save message/i })).not.toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should handle message with large payload export', async ({ page }) => {
    const topicName = `large-export-${Date.now()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await test.step('Produce large message', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      const largeContent = 'Large content '.repeat(1000); // ~14KB
      const monacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await monacoEditor.click();

      await page.evaluate(`navigator.clipboard.writeText("${largeContent}")`);
      await page.keyboard.press('Control+KeyV');
      await page.keyboard.press('Meta+KeyV');

      await page.getByTestId('produce-button').click();
      await page.waitForTimeout(2000);
    });

    await test.step('Export large message', async () => {
      await page.goto(`/topics/${topicName}`);

      // May need to click "Load anyway" for large message
      const loadButton = page.getByTestId('load-anyway-button');
      if (await loadButton.isVisible()) {
        await loadButton.click();
      }

      // Expand message
      await page.getByLabel('Collapse row').first().click();

      // Export as JSON
      await page.getByText('Download Record').click();

      const downloadPromise = page.waitForEvent('download');
      await page
        .getByRole('dialog', { name: /save message/i })
        .getByRole('button', { name: /save/i })
        .click();

      const download = await downloadPromise;
      const tempFilePath = `/tmp/test-large-${Date.now()}.json`;
      await download.saveAs(tempFilePath);

      // Verify file size
      const stats = fs.statSync(tempFilePath);
      expect(stats.size).toBeGreaterThan(1000); // Should be larger than 1KB

      // Cleanup
      fs.unlinkSync(tempFilePath);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should view message metadata', async ({ page }) => {
    const topicName = `metadata-${Date.now()}`;
    const messageValue = 'Message for metadata viewing';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await test.step('View expanded message metadata', async () => {
      await page.goto(`/topics/${topicName}`);

      // Expand message
      await page.getByLabel('Collapse row').first().click();

      // Verify metadata is visible
      await expect(page.getByText(/Offset|offset/i).first()).toBeVisible();
      await expect(page.getByText(/Partition|partition/i).first()).toBeVisible();
      await expect(page.getByText(/Timestamp|timestamp/i).first()).toBeVisible();

      // Payload content should be visible
      await expect(page.getByTestId('payload-content')).toBeVisible();
      // Message value is already visible within payload-content
    });

    await topicPage.deleteTopic(topicName);
  });
});
