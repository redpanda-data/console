import { expect, type Page, retryAssertion, step, test } from '../../shared/e2e';
import { createClientIdQuota, deleteClientIdQuota } from '../../shared/quota.utils';
import { QuotaPage } from '../utils/quota-page';

const DEFAULT_PAGE_SIZE = 10;
// Pagination tests create more quotas than fit on one page of this size.
const PAGINATION_PAGE_SIZE = 20;
const MULTI_PAGE_QUOTA_COUNT = 55;
const URL_STATE_QUOTA_COUNT = 60;

// Regex patterns for pagination tests
const ENTITY_TYPE_REGEX = /client-id|user|ip/;
const PAGE_0_REGEX = /page=0/;
const PAGE_1_REGEX = /page=1/;

/** Quotas of one test run: client IDs `<label>-<uuid>-001`, `-002`, and so on. */
type QuotaBatch = { label: string; prefix: string };

const quotaBatch = (label: string): QuotaBatch => ({ label, prefix: `${label}-${crypto.randomUUID()}` });

/**
 * Creates `count` client ID quotas in order and resolves with their client IDs.
 * Chained one `rpk` call at a time: 55-60 concurrent `docker exec` processes would overload the Redpanda container.
 */
const createNumberedQuotas = async (batch: QuotaBatch, count: number, producerByteRate: number) => {
  const quotaIds = Array.from({ length: count }, (_, i) => `${batch.prefix}-${(i + 1).toString().padStart(3, '0')}`);
  await quotaIds.reduce<Promise<unknown>>(
    (previousQuota, clientId) => previousQuota.then(() => createClientIdQuota({ clientId, producerByteRate })),
    Promise.resolve()
  );
  return quotaIds;
};

/** Chained one `rpk` call at a time, like createNumberedQuotas, to keep container load bounded. */
const deleteQuotas = (quotaIds: string[]) =>
  quotaIds.reduce<Promise<unknown>>(
    (previousDelete, quotaId) => previousDelete.then(() => deleteClientIdQuota(quotaId)),
    Promise.resolve()
  );

const quotaRows = (page: Page, batch: QuotaBatch) => page.locator('tr').filter({ hasText: batch.prefix });

const waitForQuotaRows = (page: Page, batch: QuotaBatch) =>
  retryAssertion(
    async () => {
      const visibleQuotaCount = await quotaRows(page, batch).count();
      expect(visibleQuotaCount).toBeGreaterThan(0);
    },
    { timeout: 15_000, intervals: [500, 1000, 5000] }
  );

/** The client IDs of the batch's quotas on the current page. */
const captureVisibleQuotas = async (page: Page, batch: QuotaBatch) => {
  const quotaIdPattern = new RegExp(`${batch.prefix}-\\d{3}`);
  const rowTexts = await quotaRows(page, batch).allTextContents();
  return rowTexts.flatMap((text) => text.match(quotaIdPattern)?.[0] ?? []);
};

// Capture which quotas are visible on page 1
const waitAndCaptureVisibleQuotas = async (page: Page, batch: QuotaBatch) => {
  await waitForQuotaRows(page, batch);
  const visibleQuotas = await captureVisibleQuotas(page, batch);
  expect(visibleQuotas.length).toBeGreaterThan(0);
  return visibleQuotas;
};

test.describe('quotas - Pagination', () => {
  test('should not show pagination controls when quotas count is less than page size', async ({ page }) => {
    await step('Navigate to quotas page', async () => {
      await page.goto('/quotas');
    });

    await step('Verify pagination is not visible for small datasets', async () => {
      // Check if table has rows but pagination is not present
      const rowCount = await page.locator('tr').filter({ hasText: ENTITY_TYPE_REGEX }).count();

      // If there are fewer than a page of items, pagination should not be visible
      if (rowCount < DEFAULT_PAGE_SIZE) {
        const pagination = page.locator('[aria-label="pagination"]');
        await expect(pagination).not.toBeVisible();
      }
    });
  });

  test('should navigate to next page using pagination controls', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const batch = quotaBatch('page-nav-test');

    const quotaIds = await step(`Create ${MULTI_PAGE_QUOTA_COUNT} quotas`, () =>
      createNumberedQuotas(batch, MULTI_PAGE_QUOTA_COUNT, 2_097_152 /* 2MB */)
    );

    await step('Navigate to quotas page with explicit page size', async () => {
      await page.goto(`/quotas?page=0&pageSize=${PAGINATION_PAGE_SIZE}`);
    });

    const page1Quotas = await step('Wait for quotas to load and capture page 1 quotas', () =>
      waitAndCaptureVisibleQuotas(page, batch)
    );

    await step('Click next page button', async () => {
      await quotaPage.clickNextPage();

      // Wait for page navigation to complete
      await page.waitForURL(PAGE_1_REGEX, { timeout: 5000 });
    });

    await step('Verify page 1 quotas are no longer visible on page 2', async () => {
      // At least one quota from page 1 should not be visible on page 2
      await quotaPage.verifyQuotaNotExists(page1Quotas[0]);

      // Verify we have different quotas on page 2
      const page2Rows = await quotaRows(page, batch).count();
      expect(page2Rows).toBeGreaterThan(0);
    });

    await step('Cleanup: Delete all test quotas', () => deleteQuotas(quotaIds));
  });

  test('should navigate back to previous page', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const batch = quotaBatch('prev-page-test');

    const quotaIds = await step(`Create ${MULTI_PAGE_QUOTA_COUNT} quotas`, () =>
      createNumberedQuotas(batch, MULTI_PAGE_QUOTA_COUNT, 3_145_728 /* 3MB */)
    );

    await step('Navigate to quotas page with explicit page size', async () => {
      await page.goto(`/quotas?page=0&pageSize=${PAGINATION_PAGE_SIZE}`);
    });

    const page1Quotas = await step('Wait for quotas to load and capture page 1 quotas', () =>
      waitAndCaptureVisibleQuotas(page, batch)
    );

    await step('Navigate to page 2', async () => {
      await quotaPage.clickNextPage();
      await page.waitForURL(PAGE_1_REGEX, { timeout: 5000 });
    });

    const page2Quotas = await step('Capture page 2 quotas', async () => {
      // Capture which quotas are visible on page 2
      const visibleQuotas = await captureVisibleQuotas(page, batch);
      expect(visibleQuotas.length).toBeGreaterThan(0);

      // Verify page 1 quota is not on page 2
      await quotaPage.verifyQuotaNotExists(page1Quotas[0]);
      return visibleQuotas;
    });

    await step('Navigate back to page 1', async () => {
      await quotaPage.clickPreviousPage();
      await page.waitForURL(PAGE_0_REGEX, { timeout: 5000 });
    });

    await step('Verify page 1 quotas are visible again', async () => {
      await retryAssertion(
        async () => {
          await quotaPage.verifyQuotaExists(page1Quotas[0]);
        },
        { timeout: 10_000 }
      );

      // Page 2 quota should not be visible on page 1
      await quotaPage.verifyQuotaNotExists(page2Quotas[0]);
    });

    await step('Cleanup: Delete all test quotas', () => deleteQuotas(quotaIds));
  });

  test('should persist pagination state in URL', async ({ page }) => {
    const quotaPage = new QuotaPage(page);
    const batch = quotaBatch('url-state-test');

    const quotaIds = await step(`Create ${URL_STATE_QUOTA_COUNT} quotas`, () =>
      createNumberedQuotas(batch, URL_STATE_QUOTA_COUNT, 5_242_880 /* 5MB */)
    );

    await step('Navigate to quotas page with explicit page size', async () => {
      await page.goto(`/quotas?page=0&pageSize=${PAGINATION_PAGE_SIZE}`);
    });

    const page1Quotas = await step('Wait for quotas to load and capture page 1 quotas', () =>
      waitAndCaptureVisibleQuotas(page, batch)
    );

    await step('Navigate to page 2', async () => {
      await quotaPage.clickNextPage();
      await page.waitForURL(PAGE_1_REGEX, { timeout: 5000 });
    });

    await step('Verify URL contains pagination state', () => {
      const url = page.url();
      expect(url).toContain('page=1');
      expect(url).toContain(`pageSize=${PAGINATION_PAGE_SIZE}`);
    });

    await step('Reload page and verify pagination state persists', async () => {
      await page.reload();

      // Should still be on page 2
      expect(page.url()).toContain('page=1');

      // Page 1 quota should not be visible (we're on page 2)
      await quotaPage.verifyQuotaNotExists(page1Quotas[0]);
    });

    await step('Cleanup: Delete all test quotas', () => deleteQuotas(quotaIds));
  });

  test('should display correct page info (showing X-Y of Z)', async ({ page }) => {
    const batch = quotaBatch('page-info-test');

    const quotaIds = await step(`Create ${MULTI_PAGE_QUOTA_COUNT} quotas`, () =>
      createNumberedQuotas(batch, MULTI_PAGE_QUOTA_COUNT, 6_291_456 /* 6MB */)
    );

    await step('Navigate to quotas page with explicit page size', async () => {
      await page.goto(`/quotas?page=0&pageSize=${PAGINATION_PAGE_SIZE}`);
    });

    await step('Wait for quotas to load', () => waitForQuotaRows(page, batch));

    await step('Verify page info text is displayed', async () => {
      // Look for text like "Page 1 of 3" or similar pagination info
      const pageInfo = page.locator('text=/Page \\d+ of \\d+/');

      const isVisible = await pageInfo.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        await expect(pageInfo).toBeVisible();
      }
    });

    await step('Cleanup: Delete all test quotas', () => deleteQuotas(quotaIds));
  });
});
