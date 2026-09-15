import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the reassign-partitions wizard — 45 distinct Chakra symbols and
 * three steps of state, with no Playwright spec until now.
 *
 * It walks step 1 → step 2 and back, because the step state is the thing a re-skin
 * can break invisibly: the wizard owns `currentStep` and every guard reads it, and
 * the Next button is enabled only once the step's own precondition holds.
 *
 * Deliberately stops before "Start Reassignment" — this suite runs against a live
 * cluster and starting a reassignment is not a smoke test.
 *
 * The header stats are scoped: step 1's SelectionInfoBar repeats "Leader Partitions"
 * and "Total Partitions", so a page-wide exact match trips strict mode.
 */
const SELECT_TOPIC_LABEL = /^Select topic /;
const SELECT_PARTITION_LABEL = /^Select partition /;

test.describe('Reassign partitions', () => {
  test('renders the cluster statistics and the step indicator', async ({ page }) => {
    await page.goto('/reassign-partitions');

    const stats = page.getByTestId('cluster-statistics');
    for (const label of ['Broker Count', 'Leader Partitions', 'Replica Partitions', 'Total Partitions']) {
      await expect(stats.getByText(label, { exact: true })).toBeVisible();
    }

    const steps = page.getByRole('list', { name: 'Reassignment steps' });
    await expect(steps).toBeVisible();
    for (const step of ['Select Partitions', 'Assign to Brokers', 'Review and Confirm']) {
      await expect(steps.getByText(step, { exact: true })).toBeVisible();
    }

    await expect(page.getByText('Current Reassignments')).toBeVisible();
  });

  test('gates step 1 on a partition selection, then steps forward and back', async ({ page }) => {
    await page.goto('/reassign-partitions');

    const nextButton = page.getByRole('button', { name: 'Select Target Brokers' });

    // Nothing selected yet, so the wizard will not advance.
    await expect(nextButton).toBeDisabled();

    // Select the first topic. Its checkbox has an accessible name of "Select topic <name>".
    const firstTopicCheckbox = page.getByRole('checkbox', { name: SELECT_TOPIC_LABEL }).first();
    await firstTopicCheckbox.waitFor({ state: 'visible', timeout: 30_000 });
    await firstTopicCheckbox.click();

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // Step 2 renders the broker table.
    await expect(page.getByRole('heading', { name: 'Target Brokers' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select all brokers' })).toBeVisible();

    // Back returns to step 1 with the selection intact.
    await page.getByRole('button', { name: 'Select Partitions' }).click();
    await expect(page.getByRole('button', { name: 'Select Target Brokers' })).toBeEnabled();
  });

  test('expands a topic to reveal its partitions', async ({ page }) => {
    await page.goto('/reassign-partitions');

    const expander = page.getByRole('button', { name: 'Expand row' }).first();
    await expander.waitFor({ state: 'visible', timeout: 30_000 });
    await expander.click();

    // The nested partition table appears, with its own per-partition checkboxes.
    await expect(page.getByRole('checkbox', { name: SELECT_PARTITION_LABEL }).first()).toBeVisible();
  });
});
