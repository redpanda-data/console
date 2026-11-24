import type { Page } from '../../shared/e2e';
import { expect, step, test } from '../../shared/e2e';
import { execRpk, getRedpandaContainerId } from '../../shared/rpk.utils';

const TOPIC_NAME = `e2e-unconsumed-${crypto.randomUUID()}`;
const GROUP_NAME = `e2e-unconsumed-group-${crypto.randomUUID()}`;

const COL = {
  PARTITION: 0,
  ASSIGNED_MEMBER: 1,
  HOST: 2,
  LOG_END_OFFSET: 3,
  GROUP_OFFSET: 4,
  LAG: 5,
} as const;

// WARNING: Match the partition cell specifically; an offset in another column can equal the partition ID.
function rowByPartition(page: Page, partitionId: number) {
  return page
    .locator('tr')
    .filter({
      has: page.locator(`td:nth-child(${COL.PARTITION + 1})`).filter({ hasText: new RegExp(`^${partitionId}$`, 'u') }),
    })
    .first();
}

const NO_COMMITTED_OFFSETS = 'No committed offsets';

async function expectNoCommittedOffsetTooltip(page: Page, partitionId: number) {
  await page.getByTestId(`partition-edit-${partitionId}`).hover();
  await expect(page.getByRole('tooltip')).toHaveText(NO_COMMITTED_OFFSETS);

  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toBeHidden();
}

test.describe('consumer Group Details - Unconsumed Partitions', () => {
  test.beforeAll(async () => {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const containerId = getRedpandaContainerId();
    const authFlags = '-X user=e2euser -X pass=very-secret -X sasl.mechanism=SCRAM-SHA-256';

    await execRpk(`topic create ${TOPIC_NAME} --partitions 3`);

    // WARNING: Keep produce calls in partition order; the group setup commits offsets only for the first two messages.
    await [0, 1, 2].reduce<Promise<unknown>>(
      (previousProduce, partition) =>
        previousProduce.then(() =>
          execAsync(
            `echo "msg-p${partition}" | docker exec -i ${containerId} rpk topic produce ${TOPIC_NAME} -p ${partition} ${authFlags}`
          )
        ),
      Promise.resolve()
    );

    await execAsync(
      `docker exec ${containerId} rpk topic consume ${TOPIC_NAME} -n 2 --group ${GROUP_NAME} ${authFlags}`
    );

    await execRpk(`group offset-delete ${GROUP_NAME} -t ${TOPIC_NAME}:1`);
  });

  test.afterAll(async () => {
    await execRpk(`group offset-delete ${GROUP_NAME} -t ${TOPIC_NAME}:0`).catch(() => {});
    await execRpk(`topic delete ${TOPIC_NAME}`).catch(() => {});
  });

  test('shows all 3 partitions with correct Group Offset and Lag values', async ({ page }) => {
    await step('Navigate to consumer group details page', async () => {
      await page.goto(`/groups/${GROUP_NAME}`);
      await expect(page.getByText(GROUP_NAME).first()).toBeVisible();
    });

    await step('Ensure the topic accordion is expanded', async () => {
      const accordionButton = page.getByRole('button', { name: new RegExp(TOPIC_NAME, 'u') });
      await expect(accordionButton).toBeVisible();

      const isExpanded = await accordionButton.getAttribute('aria-expanded');
      if (isExpanded !== 'true') {
        await accordionButton.click();
      }

      await expect(page.getByRole('table').first()).toBeVisible();
    });

    await step('All 3 partitions are visible in the table', async () => {
      await Promise.all([0, 1, 2].map((partitionId) => expect(rowByPartition(page, partitionId)).toBeVisible()));
    });

    await step('Partition 0 shows a numeric Group Offset (committed)', async () => {
      const row = rowByPartition(page, 0);
      const groupOffsetCell = row.locator(`td:nth-child(${COL.GROUP_OFFSET + 1})`);
      const text = await groupOffsetCell.textContent();
      expect(text?.trim()).not.toBe('—');
      expect(Number(text?.trim())).toBeGreaterThanOrEqual(0);
    });

    await step('Partition 1 shows "—" for Group Offset (offset deleted)', async () => {
      const row = rowByPartition(page, 1);
      await expect(row.locator(`td:nth-child(${COL.GROUP_OFFSET + 1})`)).toHaveText('—');
      await expect(row.locator(`td:nth-child(${COL.LAG + 1})`)).toHaveText('—');
    });

    await step('Partition 2 shows "—" for Group Offset (never consumed)', async () => {
      const row = rowByPartition(page, 2);
      await expect(row.locator(`td:nth-child(${COL.GROUP_OFFSET + 1})`)).toHaveText('—');
      await expect(row.locator(`td:nth-child(${COL.LAG + 1})`)).toHaveText('—');
    });

    await step('Edit button on partition 1 (offset deleted) is disabled with tooltip', async () => {
      await expectNoCommittedOffsetTooltip(page, 1);
    });

    await step('Edit button on partition 2 (never consumed) is disabled with tooltip', async () => {
      await expectNoCommittedOffsetTooltip(page, 2);
    });
  });
});
