import { test } from '@playwright/test';

import { createClientIdQuota, createUserQuota, deleteClientIdQuota, deleteUserQuota } from '../../shared/quota.utils';
import { QuotaPage } from '../utils/quota-page';

// E2E tests for quota management via RPK

test.describe('Quotas - RPK Integration', () => {
  test('should create quota via RPK and verify it appears in Console UI', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaClientId = `rpk-test-client-${timestamp}`;

    await test.step('Create quota using RPK', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 5_242_880, // 5MB
      });
    });

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Verify RPK-created quota is visible in UI', async () => {
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('5 MiB', quotaClientId);
      await quotaPage.verifyQuotaInTable(quotaClientId, 'client-id');
    });

    await test.step('Cleanup: Delete quota using RPK', async () => {
      await deleteClientIdQuota(quotaClientId);
    });

    await test.step('Verify quota is removed from UI', async () => {
      await quotaPage.reloadPage();
      await quotaPage.verifyQuotaNotExists(quotaClientId);
    });
  });

  test('should update existing quota via RPK and see changes in UI', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaClientId = `rpk-test-update-${timestamp}`;

    await test.step('Create initial quota using RPK', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 3_145_728, // 3MB
      });
    });

    await test.step('Verify initial quota in UI', async () => {
      await quotaPage.goToQuotasList();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('3 MiB', quotaClientId);
    });

    await test.step('Update quota using RPK', async () => {
      await createClientIdQuota({
        clientId: quotaClientId,
        producerByteRate: 8_388_608, // 8MB
        consumerByteRate: 12_582_912, // 12MB
      });
    });

    await test.step('Verify updated quota values in UI', async () => {
      await quotaPage.reloadPage();
      await quotaPage.verifyQuotaExists(quotaClientId);
      await quotaPage.verifyProducerRate('8 MiB', quotaClientId);
      await quotaPage.verifyConsumerRate('12 MiB', quotaClientId);
    });

    await test.step('Cleanup: Delete quota', async () => {
      await deleteClientIdQuota(quotaClientId);
    });
  });

  test('should handle multiple quotas created via RPK', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaClient1 = `rpk-multi-client1-${timestamp}`;
    const quotaClient2 = `rpk-multi-client2-${timestamp}`;
    const quotaUser1 = `rpk-multi-user1-${timestamp}`;

    await test.step('Create multiple quotas using RPK', async () => {
      await createClientIdQuota({
        clientId: quotaClient1,
        producerByteRate: 2_097_152, // 2MB
      });

      await createClientIdQuota({
        clientId: quotaClient2,
        consumerByteRate: 4_194_304, // 4MB
      });

      await createUserQuota({
        user: quotaUser1,
        producerByteRate: 6_291_456, // 6MB
        controllerMutationRate: 3,
      });
    });

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Verify client-id quotas are visible', async () => {
      await quotaPage.verifyQuotaExists(quotaClient1);
      await quotaPage.verifyQuotaExists(quotaClient2);
      // Note: User quotas (quotaUser1) are not displayed in Console OSS, only client-id quotas

      await quotaPage.verifyProducerRate('2 MiB', quotaClient1);
      await quotaPage.verifyConsumerRate('4 MiB', quotaClient2);
      // Skipping user quota verification as they're not displayed
    });

    await test.step('Cleanup: Delete all test quotas', async () => {
      await deleteClientIdQuota(quotaClient1);
      await deleteClientIdQuota(quotaClient2);
      await deleteUserQuota(quotaUser1);
    });

    await test.step('Verify client-id quotas are removed', async () => {
      await quotaPage.reloadPage();
      await quotaPage.verifyQuotaNotExists(quotaClient1);
      await quotaPage.verifyQuotaNotExists(quotaClient2);
      // User quota was never visible, so no need to verify it's not there
    });
  });
});
