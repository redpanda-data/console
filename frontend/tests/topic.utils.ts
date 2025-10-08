import { expect, type Page, test } from '@playwright/test';

export const createTopic = async (page: Page, { topicName }: { topicName: string }) => {
  return await test.step('Create topic', async () => {
    await page.goto('/topics');
    await page.getByTestId('create-topic-button').click();
    await page.getByTestId('topic-name').fill(topicName);
    await page.getByTestId('onOk-button').click();
    await page.getByRole('button', { name: 'Close' }).click(); // Close success dialog
    await expect(page.getByRole('link', { name: topicName })).toBeVisible();
  });
};

export const deleteTopic = async (page: Page, { topicName }: { topicName: string }) => {
  return await test.step('Delete topic', async () => {
    await page.goto('/topics');
    await expect(page.getByRole('link', { name: topicName })).toBeVisible(); // Verify topic exists
    await page.getByTestId(`delete-topic-button-${topicName}`).click();
    await page.getByTestId('delete-topic-confirm-button').click();
    await expect(page.getByText('Topic Deleted')).toBeVisible();
    await expect(page.getByRole('link', { name: topicName })).not.toBeVisible();
  });
};

export const produceMessage = async (page: Page, { topicName, message }: { topicName: string; message: string }) => {
  return await test.step('Produce message', async () => {
    await page.goto(`/topics/${topicName}/produce-record`);
    const valueMonacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
    await valueMonacoEditor.click(); // Focus the editor
    await page.keyboard.insertText(message);
    await page.getByTestId('produce-button').click();
    const messageValueCell = page.getByRole('cell', { name: new RegExp(message, 'i') }).first();
    await expect(messageValueCell).toBeVisible();
  });
};
