import { expect, step, test } from '../../shared/e2e';
import { createClientIdQuota, createUserQuota, deleteClientIdQuota, deleteUserQuota } from '../../shared/quota.utils';
import { QuotaPage } from '../utils/quota-page';

test.describe('quotas - Display and Data Verification', () => {
  test('should display quota with all rate types configured', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const suffix = crypto.randomUUID();
    const quotaClientId = `display-all-rates-${suffix}`;

    await step('Create quota with all rate types', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 10_485_760,
        consumerByteRate: 5_242_880,
        controllerMutationRate: 100,
      });
    });

    await step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await step('Verify all rate values are displayed correctly', async () => {
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyQuotaInTable(quotaClientId, 'client-id');

      const row = page.locator('tr').filter({ hasText: quotaClientId });
      await expect(row.locator('td').filter({ hasText: '10 MiB' })).toBeVisible();
      await expect(row.locator('td').filter({ hasText: '5 MiB' })).toBeVisible();
      await expect(row.locator('td').filter({ hasText: /^100$/u })).toBeVisible();
    });

    await step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should display quota with only producer rate configured', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const suffix = crypto.randomUUID();
    const quotaClientId = `producer-only-${suffix}`;

    await step('Create quota with only producer rate', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 20_971_520,
      });
    });

    await step('Navigate and verify', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('20 MiB', quotaClientId);

      const row = page.locator('tr').filter({ hasText: quotaClientId });
      await expect(row.getByRole('cell').nth(2)).toContainText('20 MiB');
    });

    await step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should display quota with only consumer rate configured', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const suffix = crypto.randomUUID();
    const quotaClientId = `consumer-only-${suffix}`;

    await step('Create quota with only consumer rate', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        consumerByteRate: 15_728_640,
      });
    });

    await step('Navigate and verify', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyConsumerRate('15 MiB', quotaClientId);
    });

    await step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should handle quotas with large byte values correctly', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const suffix = crypto.randomUUID();
    const quotaClientId = `large-values-${suffix}`;

    await step('Create quota with large byte values', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 1_073_741_824,
        consumerByteRate: 2_147_483_648,
      });
    });

    await step('Navigate and verify formatting', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);

      const row = page.locator('tr').filter({ hasText: quotaClientId });
      await expect(row.locator('td').filter({ hasText: '1 GiB' })).toBeVisible();
      await expect(row.locator('td').filter({ hasText: '2 GiB' })).toBeVisible();
    });

    await step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should display quotas table with correct column headers', async ({ page }) => {
    const quotaPage = new QuotaPage(page);

    await step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await step('Verify table column headers are present', async () => {
      await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Producer Rate' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Consumer Rate' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Controller Mutation Rate' })).toBeVisible();
    });
  });

  test('should reload page and maintain quota visibility', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const suffix = crypto.randomUUID();
    const quotaClientId = `reload-test-${suffix}`;

    await step('Create quota', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 8_388_608,
      });
    });

    await step('Initial page load and verification', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('8 MiB', quotaClientId);
    });

    await step('Reload page and verify quota still visible', async () => {
      await quotaPage.reloadPage();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('8 MiB', quotaClientId);
    });

    await step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should display multiple quotas with different entity types', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const suffix = crypto.randomUUID();
    const clientQuota = `multi-type-client-${suffix}`;
    const userQuota = `multi-type-user-${suffix}`;

    await step('Create quotas with different entity types', async () => {
      await createClientIdQuota({
        clientId: clientQuota,
        producerByteRate: 4_194_304,
      });

      await createUserQuota({
        user: userQuota,
        consumerByteRate: 6_291_456,
      });
    });

    await step('Navigate and verify client-id quota', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(clientQuota);
      await quotaPage.verifyQuotaInTable(clientQuota, 'client-id');
      await quotaPage.verifyProducerRate('4 MiB', clientQuota);
    });

    await step('Cleanup', async () => {
      await deleteClientIdQuota(clientQuota);
      await deleteUserQuota(userQuota);
    });
  });

  test('should handle zero quotas scenario (empty table)', async ({ page }) => {
    const quotaPage = new QuotaPage(page);

    await step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await step('Verify page loads without errors even if no quotas exist', async () => {
      await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible();

      await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
    });
  });
});
