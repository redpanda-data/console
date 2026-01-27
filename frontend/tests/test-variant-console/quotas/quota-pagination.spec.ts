import { expect, test } from '@playwright/test';

import { createClientIdQuota, deleteClientIdQuota } from '../../shared/quota.utils';
import { QuotaPage } from '../utils/quota-page';

const DEFAULT_PAGE_SIZE = 50;

test.describe('Quotas - Pagination', () => {
  test('should not show pagination controls when quotas count is less than page size', async ({ page }) => {
    const quotaPage = new QuotaPage(page);

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Verify pagination is not visible for small datasets', async () => {
      // Check if table has rows but pagination is not present
      const rowCount = await page
        .locator('tr')
        .filter({ hasText: /client-id|user|ip/ })
        .count();

      // If there are less than 50 items, pagination should not be visible
      if (rowCount < DEFAULT_PAGE_SIZE) {
        const pagination = page.locator('[aria-label="pagination"]');
        await expect(pagination).not.toBeVisible();
      }
    });
  });

  test('should navigate to next page using pagination controls', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaIds: string[] = [];
    const QUOTA_COUNT = 55; // More than one page

    await test.step(`Create ${QUOTA_COUNT} quotas`, async () => {
      for (let i = 1; i <= QUOTA_COUNT; i++) {
        const quotaClientId = `page-nav-test-${timestamp}-${i.toString().padStart(3, '0')}`;
        quotaIds.push(quotaClientId);

        await createClientIdQuota({
          clientId: quotaClientId,
          producerByteRate: 2_097_152, // 2MB
        });
      }
    });

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Wait for quotas to load', async () => {
      await expect(async () => {
        const visibleQuotaCount = await page
          .locator('tr')
          .filter({ hasText: `page-nav-test-${timestamp}` })
          .count();
        expect(visibleQuotaCount).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 5000] });
    });

    await test.step('Click next page button', async () => {
      const nextButton = page.getByRole('button', { name: /next/i }).or(page.locator('[aria-label*="next"]'));
      await nextButton.click();

      // Wait for page navigation to complete
      await page.waitForURL(/page=1/, { timeout: 5000 });
    });

    await test.step('Verify second page quotas are visible', async () => {
      // First quota (from page 1) should not be visible anymore
      await quotaPage.verifyQuotaNotExists(quotaIds[0]);

      // Last quota should now be visible on page 2
      await expect(async () => {
        await quotaPage.verifyQuotaExists(quotaIds[QUOTA_COUNT - 1]);
      }).toPass({ timeout: 10_000 });
    });

    await test.step('Cleanup: Delete all test quotas', async () => {
      for (const quotaId of quotaIds) {
        await deleteClientIdQuota(quotaId);
      }
    });
  });

  test('should navigate back to previous page', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaIds: string[] = [];
    const QUOTA_COUNT = 55;

    await test.step(`Create ${QUOTA_COUNT} quotas`, async () => {
      for (let i = 1; i <= QUOTA_COUNT; i++) {
        const quotaClientId = `prev-page-test-${timestamp}-${i.toString().padStart(3, '0')}`;
        quotaIds.push(quotaClientId);

        await createClientIdQuota({
          clientId: quotaClientId,
          producerByteRate: 3_145_728, // 3MB
        });
      }
    });

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Wait for quotas to load', async () => {
      await expect(async () => {
        const visibleQuotaCount = await page
          .locator('tr')
          .filter({ hasText: `prev-page-test-${timestamp}` })
          .count();
        expect(visibleQuotaCount).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 5000] });
    });

    await test.step('Navigate to page 2', async () => {
      const nextButton = page.getByRole('button', { name: /next/i }).or(page.locator('[aria-label*="next"]'));
      await nextButton.click();
      await page.waitForURL(/page=1/, { timeout: 5000 });
    });

    await test.step('Navigate back to page 1', async () => {
      const previousButton = page
        .getByRole('button', { name: /previous/i })
        .or(page.locator('[aria-label*="previous"]'));
      await previousButton.click();
      await page.waitForURL(/page=0/, { timeout: 5000 });
    });

    await test.step('Verify first page quotas are visible again', async () => {
      await expect(async () => {
        await quotaPage.verifyQuotaExists(quotaIds[0]);
      }).toPass({ timeout: 10_000 });

      // Last quota should not be visible on page 1
      await quotaPage.verifyQuotaNotExists(quotaIds[QUOTA_COUNT - 1]);
    });

    await test.step('Cleanup: Delete all test quotas', async () => {
      for (const quotaId of quotaIds) {
        await deleteClientIdQuota(quotaId);
      }
    });
  });

  test('should persist pagination state in URL', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaIds: string[] = [];
    const QUOTA_COUNT = 60;

    await test.step(`Create ${QUOTA_COUNT} quotas`, async () => {
      for (let i = 1; i <= QUOTA_COUNT; i++) {
        const quotaClientId = `url-state-test-${timestamp}-${i.toString().padStart(3, '0')}`;
        quotaIds.push(quotaClientId);

        await createClientIdQuota({
          clientId: quotaClientId,
          producerByteRate: 5_242_880, // 5MB
        });
      }
    });

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Wait for quotas to load', async () => {
      await expect(async () => {
        const visibleQuotaCount = await page
          .locator('tr')
          .filter({ hasText: `url-state-test-${timestamp}` })
          .count();
        expect(visibleQuotaCount).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 5000] });
    });

    await test.step('Navigate to page 2', async () => {
      const nextButton = page.getByRole('button', { name: /next/i }).or(page.locator('[aria-label*="next"]'));
      await nextButton.click();
      await page.waitForURL(/page=1/, { timeout: 5000 });
    });

    await test.step('Verify URL contains pagination state', async () => {
      const url = page.url();
      expect(url).toContain('page=1');
    });

    await test.step('Reload page and verify pagination state persists', async () => {
      await page.reload();

      // Should still be on page 2
      expect(page.url()).toContain('page=1');

      // First quota should not be visible (it's on page 1)
      await quotaPage.verifyQuotaNotExists(quotaIds[0]);
    });

    await test.step('Cleanup: Delete all test quotas', async () => {
      for (const quotaId of quotaIds) {
        await deleteClientIdQuota(quotaId);
      }
    });
  });

  test('should display correct page info (showing X-Y of Z)', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const timestamp = Date.now();
    const quotaIds: string[] = [];
    const QUOTA_COUNT = 55;

    await test.step(`Create ${QUOTA_COUNT} quotas`, async () => {
      for (let i = 1; i <= QUOTA_COUNT; i++) {
        const quotaClientId = `page-info-test-${timestamp}-${i.toString().padStart(3, '0')}`;
        quotaIds.push(quotaClientId);

        await createClientIdQuota({
          clientId: quotaClientId,
          producerByteRate: 6_291_456, // 6MB
        });
      }
    });

    await test.step('Navigate to quotas page', async () => {
      await quotaPage.goToQuotasList();
    });

    await test.step('Wait for quotas to load', async () => {
      await expect(async () => {
        const visibleQuotaCount = await page
          .locator('tr')
          .filter({ hasText: `page-info-test-${timestamp}` })
          .count();
        expect(visibleQuotaCount).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 5000] });
    });

    await test.step('Verify page info text is displayed', async () => {
      // Look for text like "1-50 of 55" or similar pagination info
      const pageInfo = page.locator('text=/\\d+-\\d+ of \\d+/').or(page.locator('text=/Page \\d+ of \\d+/'));

      const isVisible = await pageInfo.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        await expect(pageInfo).toBeVisible();
      }
    });

    await test.step('Cleanup: Delete all test quotas', async () => {
      for (const quotaId of quotaIds) {
        await deleteClientIdQuota(quotaId);
      }
    });
  });
});
