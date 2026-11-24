import { expect, type Locator, type Page, test } from '../../shared/e2e';
import { TopicPage } from '../utils/topic-page';

const GLOB_PATTERNS_LINK = /glob patterns/u;
const SHEET_CONTENT = '[data-slot="sheet-content"]';
const DIALOG_CONTENT = '[data-slot="dialog-content"]';

const openMessageSettingsDialog = async (page: Page, topicName: string, menuItemTestId: string) => {
  await page.goto(`/topics/${topicName}`);
  await page.getByTestId('message-settings-button').click();
  await page.getByTestId(menuItemTestId).click();

  const dialog = page.locator(DIALOG_CONTENT);
  await expect(dialog).toBeVisible();
  return dialog;
};

const expectColumnSettingsContent = async (dialog: Locator) => {
  await expect(dialog.getByText('Column Settings')).toBeVisible();
  await expect(dialog.getByText('Columns shown')).toBeVisible();

  await expect(dialog.getByRole('checkbox', { name: 'Offset' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Timestamp' })).toBeVisible();
};

test.describe('topic messages settings dialogs', () => {
  test('opens and closes the column settings dialog', async ({ page }) => {
    const topicName = `column-settings-${crypto.randomUUID()}`;
    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    const dialog = await openMessageSettingsDialog(page, topicName, 'column-settings-menu-item');
    await expectColumnSettingsContent(dialog);

    await dialog.locator('button', { hasText: 'Close' }).click();
    await expect(dialog).toBeHidden();

    await topicPage.deleteTopic(topicName);
  });

  test('opens the preview fields dialog and its nested pattern sheet', async ({ page }) => {
    const topicName = `preview-fields-${crypto.randomUUID()}`;
    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    const dialog = await openMessageSettingsDialog(page, topicName, 'preview-fields-menu-item');
    await expect(dialog.getByText('Preview fields')).toBeVisible();

    await dialog.getByRole('button', { name: GLOB_PATTERNS_LINK }).click();
    await expect(page.getByText('Glob Pattern Examples')).toBeVisible();

    await expect(page.locator(SHEET_CONTENT)).toBeVisible();
    await expect(dialog.locator(SHEET_CONTENT)).toHaveCount(0);

    await topicPage.deleteTopic(topicName);
  });
});
