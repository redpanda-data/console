import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the overview page — the first screen anyone sees, and until now
 * the largest route with no Playwright spec at all.
 *
 * Deliberately shallow: it asserts the panels are present and populated, not their
 * values, which depend on the cluster the suite happens to run against.
 */
test.describe('Overview', () => {
  test('renders the cluster statistics', async ({ page }) => {
    await page.goto('/overview');

    for (const label of [
      'Cluster Status',
      'Cluster Storage Size',
      'Cluster Version',
      'Brokers Online',
      'Topics',
      'Replicas',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('lists the brokers with a link into each one', async ({ page }) => {
    await page.goto('/overview');

    await expect(page.getByRole('heading', { name: 'Broker Details' })).toBeVisible();

    const brokerTable = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'ID' }) });
    await expect(brokerTable).toBeVisible();
    await expect(brokerTable.locator('tbody tr').first()).toBeVisible();

    // Every broker row offers a View button that navigates to the broker detail page.
    await brokerTable.getByRole('button', { name: 'View' }).first().click();
    await expect(page.getByText('Broker ID', { exact: true })).toBeVisible();
    await expect(page.getByText('Role', { exact: true })).toBeVisible();
  });

  test('renders the cluster details panel', async ({ page }) => {
    await page.goto('/overview');

    await expect(page.getByRole('heading', { name: 'Cluster Details' })).toBeVisible();

    // The three detail blocks, by their uppercase section labels.
    for (const block of ['Services', 'Storage', 'Security']) {
      await expect(page.getByText(block, { exact: true })).toBeVisible();
    }

    for (const row of ['Kafka Connect', 'Schema Registry', 'Total Bytes', 'Service Accounts', 'ACLs', 'Licensing']) {
      await expect(page.getByText(row, { exact: true })).toBeVisible();
    }
  });
});
