import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createConnector, deleteConnector } from './connector.utils';

export const ACCESS_KEY = 'accesskey';
export const SECRET_ACCESS_KEY = 'secretaccesskey';
export const S3_BUCKET_NAME = 's3bucketname';

test.describe('Connector', async () => {
    test.skip()
    
    test('should create and delete S3 connector', async ({page}) => {
        const connectorName = `connector-test-${randomUUID()}`

        await createConnector(page, {connectorName});
        await page.getByRole('tab', { name: 'Logs' }).click({
            timeout: 10000
        })

        await page.getByTestId('data-table-cell').nth(0).getByRole('button').click()
        await expect(page.getByRole('tab', { name: 'Value' })).toBeVisible();
        await deleteConnector(page, {connectorName});
    });
});
