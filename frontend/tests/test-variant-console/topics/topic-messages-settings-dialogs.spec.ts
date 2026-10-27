// spec: specs/topics.md

import { expect, type Locator, type Page, test } from '../../shared/e2e';
import { TopicPage } from '../utils/topic-page';

const GLOB_PATTERNS_LINK = /glob patterns/;
const SHEET_CONTENT = '[data-slot="sheet-content"]';
// Not `getByRole('dialog')`: Base UI's Toast.Root is one too, so it matches the messages tab's
// own "Searching..." toast — and the Sheet, which is Base UI's Dialog.
const DIALOG_CONTENT = '[data-slot="dialog-content"]';

/** Opens a dialog from the topic's message settings menu and resolves with it once visible. */
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

  // The Registry Checkbox does not wire a child label.
  await expect(dialog.getByRole('checkbox', { name: 'Offset' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Timestamp' })).toBeVisible();
};

// The legacy `Tab.Messages` settings surfaces — `enableNewTopicMessagesPage` defaults to false.
// Two Modals became Dialogs and a Drawer became a Sheet; no other spec opens any of them.
test.describe('topic messages settings dialogs', () => {
  test('opens and closes the column settings dialog', async ({ page }) => {
    const topicName = `column-settings-${crypto.randomUUID()}`;
    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    const dialog = await openMessageSettingsDialog(page, topicName, 'column-settings-menu-item');
    await expectColumnSettingsContent(dialog);

    // DialogContent's own close X is also named "Close"; only the footer button has the text.
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

    // It has to portal to the body: DialogContent is transformed and overflow-hidden, so a
    // nested fixed panel is sized and clipped against it. `toBeVisible` cannot see that.
    await expect(page.locator(SHEET_CONTENT)).toBeVisible();
    await expect(dialog.locator(SHEET_CONTENT)).toHaveCount(0);

    await topicPage.deleteTopic(topicName);
  });
});
