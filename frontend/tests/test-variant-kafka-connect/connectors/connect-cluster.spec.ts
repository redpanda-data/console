import { expect, test } from '@playwright/test';

const CLUSTER = 'local-connect-cluster';
const CREATE_URL = `/connect-clusters/${CLUSTER}/create-connector`;
const CONNECTOR_NAME = `e2e-heartbeat-${Date.now()}`;

const HEARTBEAT_CONFIG = {
  name: CONNECTOR_NAME,
  config: {
    'connector.class': 'org.apache.kafka.connect.mirror.MirrorHeartbeatConnector',
    'source.cluster.alias': 'source',
    'source.cluster.bootstrap.servers': 'redpanda:9092',
    'source.cluster.security.protocol': 'SASL_PLAINTEXT',
    'source.cluster.sasl.mechanism': 'SCRAM-SHA-256',
    'source.cluster.sasl.jaas.config':
      'org.apache.kafka.common.security.scram.ScramLoginModule required username="e2euser" password="very-secret";',
    'heartbeats.topic.replication.factor': '1',
    'tasks.max': '1',
  },
};

test.describe('Kafka Connect Cluster', () => {
  test('should show Kafka Connect tab on connect page', async ({ page }) => {
    await page.goto('/connect-clusters?defaultTab=kafka-connect');
    await expect(page.getByRole('tab', { name: 'Kafka Connect' })).toBeVisible({ timeout: 30_000 });
  });

  test('should navigate into cluster and show connectors page', async ({ page }) => {
    await page.goto(`/connect-clusters/${CLUSTER}`);
    await expect(page.getByRole('button', { name: /create connector/i })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Kafka Connect Wizard', () => {
  test('connector plugin list loads', async ({ page }) => {
    await page.goto(CREATE_URL);
    await expect(page.getByText('Heartbeat', { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('search filters connector plugins', async ({ page }) => {
    await page.goto(CREATE_URL);
    await expect(page.getByText('Heartbeat', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder('Search').fill('heartbeat');
    await expect(page.getByText('Heartbeat', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Kafka cluster topics', { exact: true })).not.toBeVisible();
  });

  test('"Export to" tab shows only sink connectors and hides source connectors', async ({ page }) => {
    await page.goto(CREATE_URL);
    await expect(page.getByText('Heartbeat', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Export to' }).click();
    // Heartbeat is a source (import) connector — must not appear under "Export to"
    await expect(page.getByText('Heartbeat', { exact: true })).not.toBeVisible();
  });

  test('"Import from" tab shows source connectors', async ({ page }) => {
    await page.goto(CREATE_URL);
    await expect(page.getByText('Heartbeat', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Import from' }).click();
    await expect(page.getByText('Heartbeat', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('selecting a plugin advances to Properties step', async ({ page }) => {
    await page.goto(CREATE_URL);
    await expect(page.getByText('Heartbeat', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByText('Heartbeat', { exact: true }).click();
    // Properties step shows Next/Back buttons and the heading changes to confirm navigation
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /import data from Heartbeat/i })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Kafka Connect Connector Lifecycle', () => {
  // Run sequentially — delete must happen last, and give more time in CI
  test.describe.configure({ timeout: 120_000, mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    const base = 'http://127.0.0.1:18283';

    // Delete any existing connector and wait for it to be fully removed
    await request.delete(`${base}/connectors/${CONNECTOR_NAME}`).catch(() => {});
    await expect
      .poll(
        async () => {
          const res = await request.get(`${base}/connectors/${CONNECTOR_NAME}`).catch(() => null);
          return res?.status() ?? 404;
        },
        { timeout: 10_000, intervals: [1000] }
      )
      .toBe(404);

    // Retry the POST in case Kafka Connect is briefly unavailable
    await expect(async () => {
      const res = await request.post(`${base}/connectors`, {
        data: HEARTBEAT_CONFIG,
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      });
      expect(res.ok() || res.status() === 409).toBe(true);
    }).toPass({ timeout: 30_000, intervals: [3000] });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`http://127.0.0.1:18283/connectors/${CONNECTOR_NAME}`).catch(() => {});
  });

  test('connector appears in cluster connectors list', async ({ page }) => {
    await page.goto(`/connect-clusters/${CLUSTER}`);
    await expect(page.getByText(CONNECTOR_NAME)).toBeVisible({ timeout: 15_000 });
  });

  test('connector detail page loads', async ({ page }) => {
    await page.goto(`/connect-clusters/${CLUSTER}/${CONNECTOR_NAME}`);
    await expect(page.getByText(CONNECTOR_NAME).first()).toBeVisible({ timeout: 10_000 });
    // Should show Overview / Configuration / Logs tabs
    await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /configuration/i })).toBeVisible();
  });

  test('connector configuration tab shows config fields', async ({ page }) => {
    await page.goto(`/connect-clusters/${CLUSTER}/${CONNECTOR_NAME}`);
    await page.getByRole('tab', { name: /configuration/i }).click();
    await expect(page.getByRole('button', { name: /update config/i })).toBeVisible({ timeout: 10_000 });
  });

  test('edit frequency of heartbeats and verify in JSON editor', async ({ page }) => {
    await page.goto(`/connect-clusters/${CLUSTER}/${CONNECTOR_NAME}`);
    await page.getByRole('tab', { name: /configuration/i }).click();

    const frequencyWrapper = page.locator('[data-testid="property-emit.heartbeats.interval.seconds"]');
    const frequencyField = frequencyWrapper.getByRole('spinbutton');
    await expect(frequencyField).toBeVisible({ timeout: 15_000 });
    await frequencyField.clear();
    await frequencyField.fill('33');

    await page.getByRole('button', { name: /update config/i }).click();
    await expect(page.getByRole('button', { name: 'Yes' })).toBeVisible();

    const updateResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/kafka-connect/clusters/${CLUSTER}/connectors/${CONNECTOR_NAME}`) &&
        res.request().method() === 'PUT',
      { timeout: 15_000 }
    );
    await page.getByRole('button', { name: 'Yes' }).click();

    const response = await updateResponse;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()?.['config']['emit.heartbeats.interval.seconds']).toBe('33');

    // Navigate back and open JSON view to verify the change
    await page.goto(`/connect-clusters/${CLUSTER}/${CONNECTOR_NAME}`);
    await page.getByRole('tab', { name: /configuration/i }).click();
    await page.locator('[data-testid="json_field"]').click();

    await expect(page.locator('.view-lines')).toContainText('"emit.heartbeats.interval.seconds": "33",', {
      timeout: 10_000,
    });
  });

  test('delete connector', async ({ page }) => {
    await page.goto(`/connect-clusters/${CLUSTER}/${CONNECTOR_NAME}`);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: 'Yes' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText('Deleted connector')).toBeVisible({ timeout: 10_000 });
  });
});
