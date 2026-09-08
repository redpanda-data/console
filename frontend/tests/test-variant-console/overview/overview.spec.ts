import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the overview page — the first screen anyone sees, and until now
 * the largest route with no Playwright spec at all.
 *
 * Deliberately shallow: it asserts the panels are present and populated, not their
 * values, which depend on the cluster the suite happens to run against.
 *
 * Locators are scoped rather than page-wide: several of these labels ("Topics",
 * "Security", "Schema Registry") are also sidebar nav items, so an unscoped
 * `getByText(..., { exact: true })` resolves to two elements and trips strict mode.
 */
const STAT_LABEL = '[data-slot="stat-label"]';
const BROKER_ID_LABEL = /^Broker ID$/i;
const ROLE_LABEL = /^Role$/i;
/** Exact-match on a stat label, scoped so sidebar items with the same text cannot collide. */
const exactly = (label: string) => new RegExp(`^${label}$`, 'i');

test.describe('Overview', () => {
  test('renders the cluster statistics', async ({ page }) => {
    await page.goto('/overview');

    const statLabels = page.locator(STAT_LABEL);
    await expect(statLabels.first()).toBeVisible();

    for (const label of [
      'Cluster Status',
      'Cluster Storage Size',
      'Cluster Version',
      'Brokers Online',
      'Topics',
      'Replicas',
    ]) {
      await expect(statLabels.filter({ hasText: exactly(label) })).toHaveCount(1);
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

    const detailLabels = page.locator(STAT_LABEL);
    await expect(detailLabels.filter({ hasText: BROKER_ID_LABEL })).toHaveCount(1);
    await expect(detailLabels.filter({ hasText: ROLE_LABEL })).toHaveCount(1);
  });

  test('renders the cluster details panel', async ({ page }) => {
    await page.goto('/overview');

    const detailsSection = page.locator('#clusterDetails');
    await expect(detailsSection).toBeVisible();
    await expect(detailsSection.getByRole('heading', { name: 'Cluster Details' })).toBeVisible();

    // The three detail blocks, by their uppercase section labels.
    for (const block of ['Services', 'Storage', 'Security']) {
      await expect(detailsSection.getByRole('heading', { name: block, exact: true })).toHaveCount(1);
    }

    for (const row of ['Kafka Connect', 'Schema Registry', 'Total Bytes', 'Service Accounts', 'ACLs', 'Licensing']) {
      await expect(detailsSection.getByRole('heading', { name: row, exact: true })).toHaveCount(1);
    }
  });
});
