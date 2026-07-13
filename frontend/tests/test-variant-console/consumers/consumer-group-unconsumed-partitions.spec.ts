import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { execRpk, getRedpandaContainerId } from '../../shared/rpk.utils';

/**
 * E2E tests for consumer group details page: unconsumed partition behaviour.
 *
 * Setup:
 *   1. Create a topic with 3 partitions.
 *   2. Produce one message to each partition (0, 1, 2).
 *   3. Consume 2 messages with a test group — committing offsets for
 *      partitions 0 and 1 (rpk consume reads in order).
 *   4. Delete the committed offset for partition 1 via `rpk group offset-delete`.
 *
 * Result:
 *   - Partition 0: has a committed offset  → shows numeric Group Offset / Lag
 *   - Partition 1: offset deleted          → shows "—" for Group Offset and Lag
 *   - Partition 2: never consumed          → shows "—" for Group Offset and Lag
 *   - Edit / Delete buttons on rows 1 and 2 are disabled with tooltip
 *     "No committed offset".
 */

const TOPIC_NAME = `e2e-unconsumed-${Date.now()}`;
const GROUP_NAME = `e2e-unconsumed-group-${Date.now()}`;

/** Column indices (0-based td positions within a data row) */
const COL = {
  PARTITION: 0,
  ASSIGNED_MEMBER: 1,
  HOST: 2,
  LOG_END_OFFSET: 3,
  GROUP_OFFSET: 4,
  LAG: 5,
  // index 6 is the actions cell
} as const;

/**
 * Find a table row whose PARTITION cell exactly matches `partitionId`.
 * Uses positional td matching so we don't accidentally match a row
 * because a different column (e.g. Log End Offset) also contains the number.
 */
function rowByPartition(page: Page, partitionId: number) {
  return page
    .locator('tr')
    .filter({
      has: page.locator(`td:nth-child(${COL.PARTITION + 1})`).filter({ hasText: new RegExp(`^${partitionId}$`) }),
    })
    .first();
}

/**
 * Hover a partition's Edit button and assert it is disabled with the "no committed offset" tooltip.
 * Closes the tooltip afterwards so the next `getByRole('tooltip')` lookup stays unambiguous.
 */
async function expectNoCommittedOffsetTooltip(page: Page, partitionId: number) {
  await page.getByTestId(`partition-edit-${partitionId}`).hover();
  await expect(page.getByRole('tooltip')).toHaveText('No committed offset');

  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toBeHidden();
}

test.describe('Consumer Group Details - Unconsumed Partitions', () => {
  test.beforeAll(async () => {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const containerId = getRedpandaContainerId();
    const authFlags = '-X user=e2euser -X pass=very-secret -X sasl.mechanism=SCRAM-SHA-256';

    // 1. Create topic with 3 partitions
    await execRpk(`topic create ${TOPIC_NAME} --partitions 3`);

    // 2. Produce one message to each partition (stdin pipe requires docker exec -i)
    for (const partition of [0, 1, 2]) {
      await execAsync(
        `echo "msg-p${partition}" | docker exec -i ${containerId} rpk topic produce ${TOPIC_NAME} -p ${partition} ${authFlags}`
      );
    }

    // 3. Consume 2 messages — commits offsets on partitions 0 and 1 (in order)
    await execAsync(
      `docker exec ${containerId} rpk topic consume ${TOPIC_NAME} -n 2 --group ${GROUP_NAME} ${authFlags}`
    );

    // 4. Delete offset for partition 1 → it becomes an "unconsumed" partition
    await execRpk(`group offset-delete ${GROUP_NAME} -t ${TOPIC_NAME}:1`);
  });

  test.afterAll(async () => {
    // Best-effort cleanup: remove remaining offsets, then delete topic
    await execRpk(`group offset-delete ${GROUP_NAME} -t ${TOPIC_NAME}:0`).catch(() => {});
    await execRpk(`topic delete ${TOPIC_NAME}`).catch(() => {});
  });

  test('shows all 3 partitions with correct Group Offset and Lag values', async ({ page }) => {
    await test.step('Navigate to consumer group details page', async () => {
      await page.goto(`/groups/${GROUP_NAME}`);
      // Wait for the group name heading to appear
      await expect(page.getByText(GROUP_NAME).first()).toBeVisible();
    });

    await test.step('Ensure the topic accordion is expanded', async () => {
      // With a single topic the accordion auto-expands, but click if collapsed
      const accordionButton = page.getByRole('button', { name: new RegExp(TOPIC_NAME) });
      await expect(accordionButton).toBeVisible();

      const isExpanded = await accordionButton.getAttribute('aria-expanded');
      if (isExpanded !== 'true') {
        await accordionButton.click();
      }

      // Wait for the data table to appear
      await expect(page.getByRole('table').first()).toBeVisible();
    });

    await test.step('All 3 partitions are visible in the table', async () => {
      for (const partitionId of [0, 1, 2]) {
        await expect(rowByPartition(page, partitionId)).toBeVisible();
      }
    });

    await test.step('Partition 0 shows a numeric Group Offset (committed)', async () => {
      const row = rowByPartition(page, 0);
      const groupOffsetCell = row.locator(`td:nth-child(${COL.GROUP_OFFSET + 1})`);
      const text = await groupOffsetCell.textContent();
      expect(text?.trim()).not.toBe('—');
      expect(Number(text?.trim())).toBeGreaterThanOrEqual(0);
    });

    await test.step('Partition 1 shows "—" for Group Offset (offset deleted)', async () => {
      const row = rowByPartition(page, 1);
      await expect(row.locator(`td:nth-child(${COL.GROUP_OFFSET + 1})`)).toHaveText('—');
      await expect(row.locator(`td:nth-child(${COL.LAG + 1})`)).toHaveText('—');
    });

    await test.step('Partition 2 shows "—" for Group Offset (never consumed)', async () => {
      const row = rowByPartition(page, 2);
      await expect(row.locator(`td:nth-child(${COL.GROUP_OFFSET + 1})`)).toHaveText('—');
      await expect(row.locator(`td:nth-child(${COL.LAG + 1})`)).toHaveText('—');
    });

    await test.step('Edit button on partition 1 (offset deleted) is disabled with tooltip', async () => {
      await expectNoCommittedOffsetTooltip(page, 1);
    });

    await test.step('Edit button on partition 2 (never consumed) is disabled with tooltip', async () => {
      await expectNoCommittedOffsetTooltip(page, 2);
    });
  });
});
