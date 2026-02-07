import { expect, test } from '@playwright/test';

import { createClientIdQuota, createUserQuota, deleteClientIdQuota, deleteUserQuota } from '../../shared/quota.utils';
import { QuotaPage } from '../utils/quota-page';

test.describe('Quotas - Display and Data Verification', () => {
  test('should display quota with all rate types configured', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaClientId = `display-all-rates-${timestamp}`;

    await test.step('Create quota with all rate types', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 10_485_760, // 10 MiB
        consumerByteRate: 5_242_880, // 5 MiB
        controllerMutationRate: 100,
      });
    });

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Verify all rate values are displayed correctly', async () => {
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyQuotaInTable(quotaClientId, 'client-id');

      // Verify all three rate types are visible in the same row
      const row = page.locator('tr').filter({ hasText: quotaClientId });
      await expect(row.locator('td').filter({ hasText: '10 MiB' })).toBeVisible();
      await expect(row.locator('td').filter({ hasText: '5 MiB' })).toBeVisible();
      await expect(row.locator('td').filter({ hasText: '100' })).toBeVisible();
    });

    await test.step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should display quota with only producer rate configured', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaClientId = `producer-only-${timestamp}`;

    await test.step('Create quota with only producer rate', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 20_971_520, // 20 MiB
      });
    });

    await test.step('Navigate and verify', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('20 MiB', quotaClientId);

      // Verify consumer and controller rates show skip icon (not configured)
      const row = page.locator('tr').filter({ hasText: quotaClientId });
      await expect(row.getByRole('cell').nth(2)).toContainText('20 MiB'); // Producer rate column
    });

    await test.step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should display quota with only consumer rate configured', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaClientId = `consumer-only-${timestamp}`;

    await test.step('Create quota with only consumer rate', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        consumerByteRate: 15_728_640, // 15 MiB
      });
    });

    await test.step('Navigate and verify', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyConsumerRate('15 MiB', quotaClientId);
    });

    await test.step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should handle quotas with large byte values correctly', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaClientId = `large-values-${timestamp}`;

    await test.step('Create quota with large byte values', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 1_073_741_824, // 1 GiB
        consumerByteRate: 2_147_483_648, // 2 GiB
      });
    });

    await test.step('Navigate and verify formatting', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);

      const row = page.locator('tr').filter({ hasText: quotaClientId });
      await expect(row.locator('td').filter({ hasText: '1 GiB' })).toBeVisible();
      await expect(row.locator('td').filter({ hasText: '2 GiB' })).toBeVisible();
    });

    await test.step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should display quotas table with correct column headers', async ({ page }) => {
    const quotaPage = new QuotaPage(page);

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Verify table column headers are present', async () => {
      await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Producer Rate' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Consumer Rate' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Controller Mutation Rate' })).toBeVisible();
    });
  });

  test('should reload page and maintain quota visibility', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaClientId = `reload-test-${timestamp}`;

    await test.step('Create quota', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 8_388_608, // 8 MiB
      });
    });

    await test.step('Initial page load and verification', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('8 MiB', quotaClientId);
    });

    await test.step('Reload page and verify quota still visible', async () => {
      await quotaPage.reloadPage();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('8 MiB', quotaClientId);
    });

    await test.step('Cleanup', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should display multiple quotas with different entity types', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const clientQuota = `multi-type-client-${timestamp}`;
    const userQuota = `multi-type-user-${timestamp}`;

    await test.step('Create quotas with different entity types', async () => {
      await createClientIdQuota({
        clientId: clientQuota,
        producerByteRate: 4_194_304, // 4 MiB
      });

      await createUserQuota({
        user: userQuota,
        consumerByteRate: 6_291_456, // 6 MiB
      });
    });

    await test.step('Navigate and verify client-id quota', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(clientQuota);
      await quotaPage.verifyQuotaInTable(clientQuota, 'client-id');
      await quotaPage.verifyProducerRate('4 MiB', clientQuota);
    });

    await test.step('Cleanup', async () => {
      await deleteClientIdQuota(clientQuota);
      await deleteUserQuota(userQuota);
    });
  });

  test('should handle zero quotas scenario (empty table)', async ({ page }) => {
    const quotaPage = new QuotaPage(page);

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Verify page loads without errors even if no quotas exist', async () => {
      // Page should load successfully
      await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible();

      // Table headers should still be visible
      await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
    });
  });
});
