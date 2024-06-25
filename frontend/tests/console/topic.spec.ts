import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test.use({
    permissions: ['clipboard-write']
})

test.describe('Topic', () => {
    test('should create a message that exceeds the display limit, checks that the exceed limit message appears', async ({page}) => {
        const topicName = `too-big-message-test-${randomUUID()}`

        await page.goto('/topics');
        await page.getByTestId('create-topic-button').click();
        await page.getByTestId('topic-name').fill(topicName);
        await page.getByTestId('onOk-button').click();
        await page.goto(`/topics/${topicName}/produce-record`);

        // const DefaultMaxDeserializationPayloadSize = 20_480 // 20 KB
        const maxMessageSize = 30000;
        const fillText = 'example content ';
        const content = fillText.repeat((maxMessageSize / fillText.length) + 1);

        const monacoEditor = page.getByTestId('produce-value-editor').locator('.monaco-editor').nth(0);
        await monacoEditor.click();
        await page.evaluate(`navigator.clipboard.writeText("${content}")`);

        // let's paste this on both Mac + Linux. proper way in the future is to identify platform first.
        await page.keyboard.press('Control+KeyV')
        await page.keyboard.press('Meta+KeyV')

        await page.getByTestId('produce-button').click()

        await page.getByText('Message size exceeds the display limit.').waitFor({
            state: 'visible',
            timeout: 5000,
        })

        await page.getByTestId('data-table-cell').nth(0).getByRole('button').click()
        await page.getByText('Because this message size exceeds the display limit, loading it could cause performance degradation.').waitFor({
            state: 'visible'
        })

        await page.getByTestId('load-anyway-button').click()
        await page.getByTestId('payload-content').getByText(content).waitFor({
            state: 'visible',
        })

        // cleanup, let's delete the topic now
        await page.goto('/topics');
        await page.getByTestId(`delete-topic-button-${topicName}`).click()
        await page.getByTestId('delete-topic-confirm-button').click()
    });
    test('should show internal topics if the corresponding checkbox is checked', async ({page}) => {
        await page.goto('/topics');
        await page.getByTestId('show-internal-topics-checkbox').check();
        await expect(page.getByTestId('data-table-cell').getByText('_internal_connectors_status')).toBeVisible()
    });
    test('should hide internal topics if the corresponding checkbox is unchecked', async ({page}) => {
        await page.goto('/topics');
        await page.getByTestId('show-internal-topics-checkbox').uncheck();
        await expect(page.getByTestId('data-table-cell').getByText('_internal_connectors_status')).not.toBeVisible()
    });
});
