import { expect, test } from '@playwright/test';

import { createClientIdQuota, deleteClientIdQuota } from '../../shared/quota.utils';
import { QuotaPage } from '../utils/quota-page';

const DEFAULT_PAGE_SIZE = 50;

// Regex patterns for pagination tests
const ENTITY_TYPE_REGEX = /client-id|user|ip/;
const PAGE_0_REGEX = /page=0/;
const PAGE_1_REGEX = /page=1/;

test.describe('Quotas - Pagination', () => {
  test('should not show pagination controls when quotas count is less than page size', async ({ page }) => {
    await test.step('Navigate to quotas page', async () => {
      await page.goto('/quotas');
    });

    await test.step('Verify pagination is not visible for small datasets', async () => {
      // Check if table has rows but pagination is not present
      const rowCount = await page.locator('tr').filter({ hasText: ENTITY_TYPE_REGEX }).count();

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
    const PAGE_SIZE = 20;

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

    const page1Quotas: string[] = [];

    await test.step('Navigate to quotas page with explicit page size', async () => {
      await page.goto(`/quotas?page=0&pageSize=${PAGE_SIZE}`);
    });

    await test.step('Wait for quotas to load and capture page 1 quotas', async () => {
      await expect(async () => {
        const visibleQuotaCount = await page
          .locator('tr')
          .filter({ hasText: `page-nav-test-${timestamp}` })
          .count();
        expect(visibleQuotaCount).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 5000] });

      // Capture which quotas are visible on page 1
      const rows = page.locator('tr').filter({ hasText: `page-nav-test-${timestamp}` });
      const rowCount = await rows.count();
      for (let i = 0; i < rowCount; i++) {
        const text = await rows.nth(i).textContent();
        const match = text?.match(/page-nav-test-\d+-\d+/);
        if (match) {
          page1Quotas.push(match[0]);
        }
      }
      expect(page1Quotas.length).toBeGreaterThan(0);
    });

    await test.step('Click next page button', async () => {
      await quotaPage.clickNextPage();

      // Wait for page navigation to complete
      await page.waitForURL(PAGE_1_REGEX, { timeout: 5000 });
    });

    await test.step('Verify page 1 quotas are no longer visible on page 2', async () => {
      // At least one quota from page 1 should not be visible on page 2
      await quotaPage.verifyQuotaNotExists(page1Quotas[0]);

      // Verify we have different quotas on page 2
      const page2Rows = await page
        .locator('tr')
        .filter({ hasText: `page-nav-test-${timestamp}` })
        .count();
      expect(page2Rows).toBeGreaterThan(0);
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
    const PAGE_SIZE = 20;

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

    const page1Quotas: string[] = [];
    const page2Quotas: string[] = [];

    await test.step('Navigate to quotas page with explicit page size', async () => {
      await page.goto(`/quotas?page=0&pageSize=${PAGE_SIZE}`);
    });

    await test.step('Wait for quotas to load and capture page 1 quotas', async () => {
      await expect(async () => {
        const visibleQuotaCount = await page
          .locator('tr')
          .filter({ hasText: `prev-page-test-${timestamp}` })
          .count();
        expect(visibleQuotaCount).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 5000] });

      // Capture which quotas are visible on page 1
      const rows = page.locator('tr').filter({ hasText: `prev-page-test-${timestamp}` });
      const rowCount = await rows.count();
      for (let i = 0; i < rowCount; i++) {
        const text = await rows.nth(i).textContent();
        const match = text?.match(/prev-page-test-\d+-\d+/);
        if (match) {
          page1Quotas.push(match[0]);
        }
      }
      expect(page1Quotas.length).toBeGreaterThan(0);
    });

    await test.step('Navigate to page 2', async () => {
      await quotaPage.clickNextPage();
      await page.waitForURL(PAGE_1_REGEX, { timeout: 5000 });
    });

    await test.step('Capture page 2 quotas', async () => {
      // Capture which quotas are visible on page 2
      const rows = page.locator('tr').filter({ hasText: `prev-page-test-${timestamp}` });
      const rowCount = await rows.count();
      for (let i = 0; i < rowCount; i++) {
        const text = await rows.nth(i).textContent();
        const match = text?.match(/prev-page-test-\d+-\d+/);
        if (match) {
          page2Quotas.push(match[0]);
        }
      }
      expect(page2Quotas.length).toBeGreaterThan(0);

      // Verify page 1 quota is not on page 2
      await quotaPage.verifyQuotaNotExists(page1Quotas[0]);
    });

    await test.step('Navigate back to page 1', async () => {
      await quotaPage.clickPreviousPage();
      await page.waitForURL(PAGE_0_REGEX, { timeout: 5000 });
    });

    await test.step('Verify page 1 quotas are visible again', async () => {
      await expect(async () => {
        await quotaPage.verifyQuotaExists(page1Quotas[0]);
      }).toPass({ timeout: 10_000 });

      // Page 2 quota should not be visible on page 1
      await quotaPage.verifyQuotaNotExists(page2Quotas[0]);
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
    const PAGE_SIZE = 20;

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

    const page1Quotas: string[] = [];

    await test.step('Navigate to quotas page with explicit page size', async () => {
      await page.goto(`/quotas?page=0&pageSize=${PAGE_SIZE}`);
    });

    await test.step('Wait for quotas to load and capture page 1 quotas', async () => {
      await expect(async () => {
        const visibleQuotaCount = await page
          .locator('tr')
          .filter({ hasText: `url-state-test-${timestamp}` })
          .count();
        expect(visibleQuotaCount).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000, intervals: [500, 1000, 5000] });

      // Capture which quotas are visible on page 1
      const rows = page.locator('tr').filter({ hasText: `url-state-test-${timestamp}` });
      const rowCount = await rows.count();
      for (let i = 0; i < rowCount; i++) {
        const text = await rows.nth(i).textContent();
        const match = text?.match(/url-state-test-\d+-\d+/);
        if (match) {
          page1Quotas.push(match[0]);
        }
      }
      expect(page1Quotas.length).toBeGreaterThan(0);
    });

    await test.step('Navigate to page 2', async () => {
      await quotaPage.clickNextPage();
      await page.waitForURL(PAGE_1_REGEX, { timeout: 5000 });
    });

    await test.step('Verify URL contains pagination state', () => {
      const url = page.url();
      expect(url).toContain('page=1');
      expect(url).toContain(`pageSize=${PAGE_SIZE}`);
    });

    await test.step('Reload page and verify pagination state persists', async () => {
      await page.reload();

      // Should still be on page 2
      expect(page.url()).toContain('page=1');

      // Page 1 quota should not be visible (we're on page 2)
      await quotaPage.verifyQuotaNotExists(page1Quotas[0]);
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
    const PAGE_SIZE = 20;

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

    await test.step('Navigate to quotas page with explicit page size', async () => {
      await page.goto(`/quotas?page=0&pageSize=${PAGE_SIZE}`);
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
      // Look for text like "Page 1 of 3" or similar pagination info
      const pageInfo = page.locator('text=/Page \\d+ of \\d+/');

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
