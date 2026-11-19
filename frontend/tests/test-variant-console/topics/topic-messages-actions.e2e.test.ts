import fs from 'node:fs';
import { type Download, expect, type Page, step, test } from '../../shared/e2e';
import { TopicPage } from '../utils/topic-page';

/** Opens the topic, expands its first message and opens the message export dialog. */
const openFirstMessageExportDialog = async (page: Page, topicName: string) => {
  await page.goto(`/topics/${topicName}`);

  await page.getByLabel('Expand row').first().click();

  await page.getByText('Download Record').click();
};

/** Clicks the export dialog's save button and resolves with the download it starts. */
const downloadExport = async (page: Page, saveButtonName: RegExp) => {
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: /save message/iu })
    .getByRole('button', { name: saveButtonName })
    .click();
  return downloadPromise;
};

/** Saves the download to `tempFilePath`, reads it back, and removes the file. */
const readDownload = async (download: Download, tempFilePath: string) => {
  await download.saveAs(tempFilePath);
  const fileContent = fs.readFileSync(tempFilePath, 'utf-8');
  fs.unlinkSync(tempFilePath);
  return fileContent;
};

/** Saves the download to `tempFilePath`, measures it in bytes, and removes the file. */
const readDownloadSize = async (download: Download, tempFilePath: string) => {
  await download.saveAs(tempFilePath);
  const { size } = fs.statSync(tempFilePath);
  fs.unlinkSync(tempFilePath);
  return size;
};

const loadLargeMessagesIfPrompted = async (page: Page) => {
  const loadButton = page.getByTestId('load-anyway-button');
  if (await loadButton.isVisible()) {
    await loadButton.click();
  }
};

test.describe('message Actions and Export', () => {
  test('should copy message value to clipboard', async ({ page }) => {
    const topicName = `copy-clipboard-${crypto.randomUUID()}`;
    const messageValue = 'Copy this message to clipboard';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await step('Copy message value', async () => {
      await page.goto(`/topics/${topicName}`);

      await page.getByLabel('Expand row').first().click();

      await page.getByRole('button', { name: /copy value/iu }).click();
    });

    await step('Verify clipboard content', async () => {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBe(messageValue);

      await expect(page.getByText('Value copied to clipboard')).toBeVisible({ timeout: 5000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should export single message as JSON', async ({ page }) => {
    const topicName = `export-json-${crypto.randomUUID()}`;
    const messageValue = 'Export this message as JSON';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await step('Export message as JSON', async () => {
      await openFirstMessageExportDialog(page, topicName);

      const download = await downloadExport(page, /save/iu);

      expect(download.suggestedFilename()).toMatch(/\.json$/u);

      const fileContent = await readDownload(download, `/tmp/test-${download.suggestedFilename()}`);
      expect(fileContent).toContain(messageValue);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should export single message as CSV', async ({ page }) => {
    const topicName = `export-csv-${crypto.randomUUID()}`;
    const messageValue = 'Export this message as CSV';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await step('Export message as CSV', async () => {
      await openFirstMessageExportDialog(page, topicName);

      await page.getByTestId('csv_field').click();

      const download = await downloadExport(page, /save messages/iu);

      expect(download.suggestedFilename()).toMatch('messages.csv');

      const fileContent = await readDownload(download, `/tmp/test-${download.suggestedFilename()}`);
      expect(fileContent).toContain(messageValue);
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should export message with special characters', async ({ page }) => {
    const topicName = `export-special-${crypto.randomUUID()}`;
    const messageValue = 'Message with "quotes", commas, and émojis 🎉';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await step('Export and verify special characters', async () => {
      await openFirstMessageExportDialog(page, topicName);
      const download = await downloadExport(page, /save/iu);
      const fileContent = await readDownload(download, `/tmp/test-special-${crypto.randomUUID()}.json`);

      expect(fileContent).toContain('quotes');
      expect(fileContent).toContain('émojis');
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should open and cancel export dialog', async ({ page }) => {
    const topicName = `cancel-export-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, 'Message for cancel test');

    await step('Open and cancel export', async () => {
      await page.goto(`/topics/${topicName}`);

      await page.getByLabel('Expand row').first().click();

      await page.getByText('Download Record').click();

      await expect(page.getByRole('dialog', { name: /save message/iu })).toBeVisible();

      const cancelButton = page.getByRole('button', { name: /cancel/iu });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();

        await expect(page.getByRole('dialog', { name: /save message/iu })).not.toBeVisible();
      }
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should handle message with large payload export', async ({ page }) => {
    const topicName = `large-export-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Produce large message', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      const largeContent = 'Large content '.repeat(1000); // ~14KB
      const monacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await monacoEditor.click();

      await page.evaluate(`navigator.clipboard.writeText("${largeContent}")`);
      await page.keyboard.press('Control+KeyV');
      await page.keyboard.press('Meta+KeyV');

      await page.getByTestId('produce-button').click();
    });

    await step('Export large message', async () => {
      await page.goto(`/topics/${topicName}`);

      await loadLargeMessagesIfPrompted(page);

      await page.getByLabel('Expand row').first().click();

      await page.getByText('Download Record').click();
      const download = await downloadExport(page, /save/iu);

      const fileSize = await readDownloadSize(download, `/tmp/test-large-${crypto.randomUUID()}.json`);
      expect(fileSize).toBeGreaterThan(1000); // Should be larger than 1KB
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should view message metadata', async ({ page }) => {
    const topicName = `metadata-${crypto.randomUUID()}`;
    const messageValue = 'Message for metadata viewing';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageValue);

    await step('View expanded message metadata', async () => {
      await page.goto(`/topics/${topicName}`);

      await page.getByLabel('Expand row').first().click();

      await expect(page.getByText(/Offset|offset/iu).first()).toBeVisible();
      await expect(page.getByText(/Partition|partition/iu).first()).toBeVisible();
      await expect(page.getByText(/Timestamp|timestamp/iu).first()).toBeVisible();

      await expect(page.getByTestId('payload-content')).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });
});
