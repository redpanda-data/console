// spec: specs/topics.md
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

/**
 * Mock cluster API response for testing default values
 */
const mockClusterResponse = {
  clusterInfo: {
    controllerId: 0,
    brokers: [
      {
        brokerId: 0,
        logDirSize: 283_431_018,
        address: 'redpanda',
        rack: null,
        config: {
          configs: [
            {
              name: 'log.retention.ms',
              value: '604800000', // 7 days in milliseconds
              source: 'DEFAULT_CONFIG',
              type: 'LONG',
              isExplicitlySet: false,
              isDefaultValue: true,
              isReadOnly: false,
              isSensitive: false,
              synonyms: [
                {
                  name: 'log_retention_ms',
                  value: '604800000',
                  source: 'DEFAULT_CONFIG',
                },
              ],
            },
            {
              name: 'log.retention.bytes',
              value: '18446744073709551615', // Max uint64 = infinite
              source: 'DEFAULT_CONFIG',
              type: 'LONG',
              isExplicitlySet: false,
              isDefaultValue: true,
              isReadOnly: false,
              isSensitive: false,
              synonyms: [
                {
                  name: 'retention_bytes',
                  value: '18446744073709551615',
                  source: 'DEFAULT_CONFIG',
                },
              ],
            },
            {
              name: 'num.partitions',
              value: '1',
              source: 'DEFAULT_CONFIG',
              type: 'INT',
              isExplicitlySet: false,
              isDefaultValue: true,
              isReadOnly: false,
              isSensitive: false,
              synonyms: [
                {
                  name: 'default_topic_partitions',
                  value: '1',
                  source: 'DEFAULT_CONFIG',
                },
              ],
            },
            {
              name: 'default.replication.factor',
              value: '1',
              source: 'DEFAULT_CONFIG',
              type: 'SHORT',
              isExplicitlySet: false,
              isDefaultValue: true,
              isReadOnly: false,
              isSensitive: false,
              synonyms: [
                {
                  name: 'default_topic_replications',
                  value: '1',
                  source: 'DEFAULT_CONFIG',
                },
              ],
            },
          ],
        },
      },
    ],
    kafkaVersion: 'Redpanda v25.3.2',
  },
};

test.describe('Create Topic Modal - Default Values', () => {
  test('should display correct default values from cluster configuration', async ({ page }) => {
    // Mock the /api/cluster endpoint to return our test data
    await page.route('**/api/cluster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClusterResponse),
      });
    });

    await test.step('Navigate to topics page and open create modal', async () => {
      await page.goto('/topics');
      await page.getByTestId('create-topic-button').click();
      await expect(page.getByTestId('topic-name')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify partitions default value', async () => {
      const partitionsInput = page.getByTestId('topic-partitions');
      await expect(partitionsInput).toBeVisible();
      await expect(partitionsInput).toHaveAttribute('placeholder', '1');
      await expect(partitionsInput).toHaveValue('');
    });

    await test.step('Verify replication factor default value', async () => {
      const replicationInput = page.getByTestId('topic-replication-factor');
      await expect(replicationInput).toBeVisible();
      await expect(replicationInput).toHaveAttribute('placeholder', '1');
      await expect(replicationInput).toHaveValue('');
    });

    await test.step('Verify retention time default value shows 7 days', async () => {
      // prettyMilliseconds(604800000) with verbose=true, unitCount=2 returns "7 days"
      const retentionTimeInput = page.getByTestId('topic-retention-time');
      await expect(retentionTimeInput).toBeVisible();
      await expect(retentionTimeInput).toHaveAttribute('placeholder', '7 days');
      await expect(retentionTimeInput).toHaveValue('');
    });

    await test.step('Verify retention size default value shows Infinite', async () => {
      // 18446744073709551615 (max uint64) is treated as infinite
      const retentionSizeInput = page.getByTestId('topic-retention-size');
      await expect(retentionSizeInput).toBeVisible();
      await expect(retentionSizeInput).toHaveAttribute('placeholder', 'Infinite');
      await expect(retentionSizeInput).toHaveValue('');
    });

    // Close the modal
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should display custom default values when cluster returns different config', async ({ page }) => {
    // Create a modified response with different default values
    const customClusterResponse = {
      clusterInfo: {
        ...mockClusterResponse.clusterInfo,
        brokers: [
          {
            ...mockClusterResponse.clusterInfo.brokers[0],
            config: {
              configs: [
                {
                  name: 'log.retention.ms',
                  value: '86400000', // 1 day in milliseconds
                  source: 'DEFAULT_CONFIG',
                  type: 'LONG',
                  isExplicitlySet: false,
                  isDefaultValue: true,
                  isReadOnly: false,
                  isSensitive: false,
                  synonyms: [],
                },
                {
                  name: 'log.retention.bytes',
                  value: '1073741824', // 1 GiB
                  source: 'DEFAULT_CONFIG',
                  type: 'LONG',
                  isExplicitlySet: false,
                  isDefaultValue: true,
                  isReadOnly: false,
                  isSensitive: false,
                  synonyms: [],
                },
                {
                  name: 'num.partitions',
                  value: '3',
                  source: 'DEFAULT_CONFIG',
                  type: 'INT',
                  isExplicitlySet: false,
                  isDefaultValue: true,
                  isReadOnly: false,
                  isSensitive: false,
                  synonyms: [],
                },
                {
                  name: 'default.replication.factor',
                  value: '3',
                  source: 'DEFAULT_CONFIG',
                  type: 'SHORT',
                  isExplicitlySet: false,
                  isDefaultValue: true,
                  isReadOnly: false,
                  isSensitive: false,
                  synonyms: [],
                },
              ],
            },
          },
        ],
      },
    };

    await page.route('**/api/cluster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(customClusterResponse),
      });
    });

    await test.step('Navigate to topics page and open create modal', async () => {
      await page.goto('/topics');
      await page.getByTestId('create-topic-button').click();
      await expect(page.getByTestId('topic-name')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify partitions shows custom default of 3', async () => {
      const partitionsInput = page.getByTestId('topic-partitions');
      await expect(partitionsInput).toBeVisible();
      await expect(partitionsInput).toHaveAttribute('placeholder', '3');
      await expect(partitionsInput).toHaveValue('');
    });

    await test.step('Verify replication factor shows custom default of 3', async () => {
      const replicationInput = page.getByTestId('topic-replication-factor');
      await expect(replicationInput).toBeVisible();
      await expect(replicationInput).toHaveAttribute('placeholder', '3');
      await expect(replicationInput).toHaveValue('');
    });

    await test.step('Verify retention time shows 1 day', async () => {
      // prettyMilliseconds(86400000) with verbose=true returns "1 day"
      const retentionTimeInput = page.getByTestId('topic-retention-time');
      await expect(retentionTimeInput).toBeVisible();
      await expect(retentionTimeInput).toHaveAttribute('placeholder', '1 day');
      await expect(retentionTimeInput).toHaveValue('');
    });

    await test.step('Verify retention size shows 1 GiB', async () => {
      // prettyBytes(1073741824) returns "1 GiB"
      const retentionSizeInput = page.getByTestId('topic-retention-size');
      await expect(retentionSizeInput).toBeVisible();
      await expect(retentionSizeInput).toHaveAttribute('placeholder', '1 GiB');
      await expect(retentionSizeInput).toHaveValue('');
    });

    // Close the modal
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
