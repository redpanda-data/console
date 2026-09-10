// spec: specs/topics.md

import { expect, test } from '@playwright/test';

import { TopicPage } from '../utils/topic-page';

const GLOB_PATTERNS_LINK = /glob patterns/;

/**
 * Smoke coverage for the three settings surfaces on the messages tab.
 *
 * `enableNewTopicMessagesPage` defaults to false, so this exercises the legacy `Tab.Messages`
 * view — which four existing specs already cover for filtering, production and timestamps, but
 * none of them opens these three. They are the riskiest part of the Chakra swap: two Chakra
 * `Modal`s became Registry `Dialog`s and a Chakra `Drawer` became a `Sheet`, and a dialog that
 * fails to open, or a nested popover that portals outside its focus lock, is invisible to the
 * type checker and to every other spec.
 */
test.describe('Topic messages settings dialogs', () => {
  test('opens and closes the column settings dialog', async ({ page }) => {
    const topicName = `column-settings-${Date.now()}`;
    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await page.goto(`/topics/${topicName}`);
    await page.getByTestId('message-settings-button').click();
    await page.getByTestId('column-settings-menu-item').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Column Settings')).toBeVisible();
    await expect(dialog.getByText('Columns shown')).toBeVisible();

    // Each column is a checkbox with its own label. Chakra's Checkbox took the label as a child
    // and wired it; the Registry's does not, so a bad swap leaves the boxes unnamed.
    await expect(dialog.getByRole('checkbox', { name: 'Offset' })).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Timestamp' })).toBeVisible();

    // `DialogContent` renders its own close X with an aria-label of "Close", so a role query by
    // name matches two buttons. Only the footer button carries the text.
    await dialog.locator('button', { hasText: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test('opens the preview fields dialog and its nested pattern sheet', async ({ page }) => {
    const topicName = `preview-fields-${Date.now()}`;
    const topicPage = new TopicPage(page);
    await topicPage.createTopic(topicName);

    await page.goto(`/topics/${topicName}`);
    await page.getByTestId('message-settings-button').click();
    await page.getByTestId('preview-fields-menu-item').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Preview fields')).toBeVisible();

    // The glob-pattern help was a Chakra Drawer and is now a Sheet, opened from inside the dialog.
    await dialog.getByRole('button', { name: GLOB_PATTERNS_LINK }).click();
    await expect(page.getByText('Glob Pattern Examples')).toBeVisible();
  });
});
