import { expect, type Page, test } from '../../shared/e2e';

// WARNING: Stop before Start Reassignment; this smoke test uses a live cluster and should not move partitions.
const SELECT_TOPIC_LABEL = /^Select topic /u;
const SELECT_PARTITION_LABEL = /^Select partition /u;

const selectFirstTopic = async (page: Page) => {
  const firstTopicCheckbox = page.getByRole('checkbox', { name: SELECT_TOPIC_LABEL }).first();
  await firstTopicCheckbox.waitFor({ state: 'visible', timeout: 30_000 });
  await firstTopicCheckbox.click();
};

const expectBrokerStep = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Target Brokers' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Select all brokers' })).toBeVisible();
};

test.describe('reassign partitions', () => {
  test('renders the cluster statistics and the step indicator', async ({ page }) => {
    await page.goto('/reassign-partitions');

    const stats = page.getByTestId('cluster-statistics');
    await Promise.all(
      ['Broker Count', 'Leader Partitions', 'Replica Partitions', 'Total Partitions'].map((label) =>
        expect(stats.getByText(label, { exact: true })).toBeVisible()
      )
    );

    const steps = page.getByRole('list', { name: 'Reassignment steps' });
    await expect(steps).toBeVisible();
    await Promise.all(
      ['Select Partitions', 'Assign to Brokers', 'Review and Confirm'].map((step) =>
        expect(steps.getByText(step, { exact: true })).toBeVisible()
      )
    );

    await expect(page.getByText('Current Reassignments')).toBeVisible();
  });

  test('gates step 1 on a partition selection, then steps forward and back', async ({ page }) => {
    await page.goto('/reassign-partitions');

    const nextButton = page.getByRole('button', { name: 'Select Target Brokers' });

    await expect(nextButton).toBeDisabled();

    await selectFirstTopic(page);

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expectBrokerStep(page);

    await page.getByRole('button', { name: 'Select Partitions' }).click();
    await expect(page.getByRole('button', { name: 'Select Target Brokers' })).toBeEnabled();
  });

  test('expands a topic to reveal its partitions', async ({ page }) => {
    await page.goto('/reassign-partitions');

    const expander = page.getByRole('button', { name: 'Expand row' }).first();
    await expander.waitFor({ state: 'visible', timeout: 30_000 });
    await expander.click();

    await expect(page.getByRole('checkbox', { name: SELECT_PARTITION_LABEL }).first()).toBeVisible();
  });
});
