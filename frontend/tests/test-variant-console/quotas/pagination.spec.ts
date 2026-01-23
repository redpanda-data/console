import { expect, test } from '@playwright/test';

import { createClientIdQuota, deleteClientIdQuota } from '../../shared/quota.utils';
import { QuotaPage } from '../utils/quota-page';

const QUOTAS_TEST_LIMIT = 50;

test.describe('Quotas - Display 50 quotas', () => {
  test(`should create ${QUOTAS_TEST_LIMIT} quotas and verify all are visible on the page`, async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaIds: string[] = [];

    await test.step(`Create ${QUOTAS_TEST_LIMIT} quotas using RPK`, async () => {
      for (let i = 1; i <= QUOTAS_TEST_LIMIT; i++) {
        const quotaClientId = `quota-test-${timestamp}-${i.toString().padStart(3, '0')}`;
        quotaIds.push(quotaClientId);

        await createClientIdQuota({
          clientId: quotaClientId,
          producerByteRate: 1_048_576 * i, // 1MB * i
        });
      }
    });

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step(`Verify all ${QUOTAS_TEST_LIMIT} quotas are visible on the page`, async () => {
      // Wait for all quotas to load (app loads in batches)
      // Use toPass() to retry until all batches have loaded
      await expect(async () => {
        const visibleQuotaCount = await page
          .locator('tr')
          .filter({ hasText: `quota-test-${timestamp}` })
          .count();
        expect(visibleQuotaCount).toBe(QUOTAS_TEST_LIMIT);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 5000] });

      // Final verification - count should now be stable at 50
      const visibleQuotaCount = await page
        .locator('tr')
        .filter({ hasText: `quota-test-${timestamp}` })
        .count();

      // Verify all quotas are visible
      expect(visibleQuotaCount).toBe(QUOTAS_TEST_LIMIT);

      // Verify a few specific quotas by name to ensure they're actually rendered
      await quotaPage.verifyQuotaExists(quotaIds[0]); // First quota
      await quotaPage.verifyQuotaExists(quotaIds[Math.floor(QUOTAS_TEST_LIMIT / 2)]); // Middle quota
      await quotaPage.verifyQuotaExists(quotaIds[QUOTAS_TEST_LIMIT - 1]); // Last quota
    });

    await test.step('Cleanup: Delete all test quotas', async () => {
      for (const quotaId of quotaIds) {
        await deleteClientIdQuota(quotaId);
      }
    });

    await test.step('Verify quotas are removed from UI', async () => {
      await quotaPage.reloadPage();

      // Verify no test quotas remain
      const remainingTestQuotas = await page
        .locator('tr')
        .filter({ hasText: `quota-test-${timestamp}` })
        .count();
      expect(remainingTestQuotas).toBe(0);
    });
  });
});
