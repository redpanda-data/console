import { randomUUID } from 'node:crypto';
import { createConnector, deleteConnector } from '../../shared/connector.utils';
import { expect, retryAssertion, test } from '../../shared/e2e';

test.describe('connector', () => {
  test('should create and delete S3 connector', async ({ page }) => {
    const clusterName = 'local-connect-cluster';
    const connectorName = `connector-test-${randomUUID()}`;

    await createConnector(page, { clusterName, connectorName });
    await page.getByRole('tab', { name: 'Logs' }).click({
      timeout: 11_000, // 11s because there is a max timer of 10s in connector create wait operation
    });

    // Kafka Connect writes the connector's startup to the logs topic within seconds of creation.
    const firstLog = page.getByRole('button', { name: 'Expand row' }).first();
    await retryAssertion(
      async () => {
        await page.getByRole('button', { name: 'Refresh logs' }).click();
        await expect(firstLog).toBeVisible({ timeout: 2000 });
      },
      { timeout: 15_000, intervals: [1000] }
    );
    await firstLog.click();
    await expect(page.getByRole('tab', { name: 'Value' })).toBeVisible();
    await deleteConnector(page, { clusterName, connectorName });
  });
});
