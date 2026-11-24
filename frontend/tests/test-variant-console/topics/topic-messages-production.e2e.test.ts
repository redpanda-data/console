import { expect, step, test } from '../../shared/e2e';
import { TopicPage } from '../utils/topic-page';

test.describe('produce Messages', () => {
  test('should produce simple text message', async ({ page }) => {
    const topicName = `text-message-${crypto.randomUUID()}`;
    const messageContent = 'Hello Redpanda Console';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await topicPage.produceMessage(topicName, messageContent);

    await step('Verify message in messages tab', async () => {
      await page.goto(`/topics/${topicName}`);
      await expect(page.getByText(messageContent)).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should produce message with key', async ({ page }) => {
    const topicName = `keyed-message-${crypto.randomUUID()}`;
    const messageKey = 'user-123';
    const messageValue = 'User data for user 123';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Produce message with key', async () => {
      await topicPage.goToProduceRecord(topicName);
      await topicPage.fillKeyEditor(messageKey);
      await topicPage.fillValueEditor(messageValue);
      await topicPage.clickProduceButton();
      await topicPage.verifyMessageProduced(messageValue);
    });

    await step('Verify the key is shown with the message', async () => {
      await expect(page.getByRole('cell', { name: messageKey }).first()).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should produce multiple messages in sequence', async ({ page }) => {
    const topicName = `multi-produce-${crypto.randomUUID()}`;
    const messages = ['Message One', 'Message Two', 'Message Three'];

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await messages.reduce<Promise<unknown>>(
      (previousMessage, message) =>
        previousMessage.then(() =>
          step(`Produce message: ${message}`, async () => {
            await page.goto(`/topics/${topicName}/produce-record`);

            const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
            await valueEditor.click();

            await page.keyboard.press('Meta+A'); // Select all (Mac)
            await page.keyboard.press('Control+A'); // Select all (Windows/Linux)
            await page.keyboard.press('Backspace');

            await page.keyboard.insertText(message);
            await page.getByTestId('produce-button').click();

            await expect(page.getByRole('cell', { name: new RegExp(message, 'iu') }).first()).toBeVisible({
              timeout: 10_000,
            });
          })
        ),
      Promise.resolve()
    );

    await step('Verify all messages in topic', async () => {
      await page.goto(`/topics/${topicName}`);

      await Promise.all(messages.map((message) => expect(page.getByText(message)).toBeVisible()));
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should produce large message and handle display limit', async ({ page }) => {
    const topicName = `large-message-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);
    await page.goto(`/topics/${topicName}/produce-record`);

    await step('Produce large message', async () => {
      const maxMessageSize = 30_000;
      const fillText = 'example content ';
      const content = fillText.repeat(Math.floor(maxMessageSize / fillText.length) + 1);

      const monacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await monacoEditor.click();

      await page.evaluate(`navigator.clipboard.writeText("${content}")`);
      await page.keyboard.press('Control+KeyV');
      await page.keyboard.press('Meta+KeyV');

      await page.getByTestId('produce-button').click();

      await page.getByText('Message size exceeds the display limit.').waitFor({
        state: 'visible',
        timeout: 10_000,
      });
    });

    await step('Load large message', async () => {
      await page.getByLabel('Expand row').first().click();

      await page
        .getByText(
          'Because this message size exceeds the display limit, loading it could cause performance degradation.'
        )
        .waitFor({
          state: 'visible',
          timeout: 5000,
        });

      await page.getByTestId('load-anyway-button').click();

      await expect(page.getByTestId('payload-content')).toBeVisible({ timeout: 5000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should navigate to produce page and see form elements', async ({ page }) => {
    const topicName = `produce-ui-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Navigate to produce page', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      await expect(page.getByTestId('produce-button')).toBeVisible();
      await expect(page.getByTestId('produce-value-editor')).toBeVisible();
      await expect(page.getByTestId('produce-key-editor')).toBeVisible();

      await expect(page.locator('text=/Produce|Publish/i').first()).toBeVisible({ timeout: 5000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should handle empty message production', async ({ page }) => {
    const topicName = `empty-message-${crypto.randomUUID()}`;

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Try to produce empty message', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueEditor.click();

      await page.getByTestId('produce-button').click();

      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    });

    await topicPage.deleteTopic(topicName);
  });

  test('should clear editor content between produces', async ({ page }) => {
    const topicName = `clear-editor-${crypto.randomUUID()}`;
    const message1 = 'First message';
    const message2 = 'Second message';

    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await step('Produce first message', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);
      const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueEditor.click();
      await page.keyboard.insertText(message1);
      await page.getByTestId('produce-button').click();

      await expect(page.getByRole('cell', { name: new RegExp(message1, 'iu') }).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await step('Produce second message - editor should be clear or have previous content', async () => {
      await page.goto(`/topics/${topicName}/produce-record`);

      const valueEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
      await valueEditor.click();

      await page.keyboard.press('Control+A');
      await page.keyboard.press('Meta+A');
      await page.keyboard.press('Backspace');

      await page.keyboard.insertText(message2);
      await page.getByTestId('produce-button').click();

      await expect(page.getByRole('cell', { name: new RegExp(message2, 'iu') }).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await step('Verify both messages exist', async () => {
      await page.goto(`/topics/${topicName}`);
      await expect(page.getByText(message1)).toBeVisible();
      await expect(page.getByText(message2)).toBeVisible();
    });

    await topicPage.deleteTopic(topicName);
  });
});
