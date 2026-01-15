/**
 * E2E tests for Traces page workflow
 *
 * Note: These tests require trace data to be present in the system.
 * They test the UI interactions and navigation, not trace data creation.
 */

import { expect, test } from '@playwright/test';

import { TracePage } from '../../console/utils/trace-page';

test.describe('Traces Page - Navigation and UI', () => {
  test('should navigate to traces page and display UI elements', async ({ page }) => {
    const tracePage = new TracePage(page);
    await tracePage.goto();

    await test.step('Verify page loaded with required elements', async () => {
      await tracePage.verifyPageLoaded();

      // Verify search input exists
      await expect(page.getByPlaceholder(/search traces/i)).toBeVisible();

      // Verify column headers exist
      await expect(page.getByTestId('traces-sort-toggle')).toBeVisible();
      await expect(page.getByText('Span')).toBeVisible();
      await expect(page.getByText('Duration')).toBeVisible();
    });
  });

  test('should toggle sort order between newest and oldest', async ({ page }) => {
    const tracePage = new TracePage(page);
    await tracePage.goto();

    await test.step('Verify initial sort order is newest first', async () => {
      await tracePage.verifySortOrder('newest');
    });

    await test.step('Toggle to oldest first', async () => {
      await tracePage.toggleSortOrder();
      await tracePage.verifySortOrder('oldest');
    });

    await test.step('Toggle back to newest first', async () => {
      await tracePage.toggleSortOrder();
      await tracePage.verifySortOrder('newest');
    });
  });
});

test.describe('Traces Page - Filtering', () => {
  test('should filter traces by search query', async ({ page }) => {
    const tracePage = new TracePage(page);
    await tracePage.goto();
    await tracePage.waitForLoad();

    const initialCount = await tracePage.getTraceCount();

    // Skip if no traces are available
    if (initialCount === 0) {
      test.skip();
      return;
    }

    await test.step('Apply search filter', async () => {
      // Use a search term that likely won't match any traces
      await tracePage.searchTraces('nonexistent-trace-xyz-12345');

      // Wait for filter to apply
      await page.waitForTimeout(500);
    });

    await test.step('Verify filtered results', async () => {
      const filteredCount = await tracePage.getTraceCount();
      // Either no results or fewer results than before
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    });

    await test.step('Clear search and verify all traces return', async () => {
      await tracePage.clearSearch();
      await page.waitForTimeout(500);

      const restoredCount = await tracePage.getTraceCount();
      expect(restoredCount).toBe(initialCount);
    });
  });
});

test.describe('Traces Page - Trace Expansion', () => {
  test.beforeEach(async ({ page }) => {
    const tracePage = new TracePage(page);
    await tracePage.goto();
    await tracePage.waitForLoad();
  });

  test('should expand trace row to show child spans', async ({ page }) => {
    const tracePage = new TracePage(page);

    const traceCount = await tracePage.getTraceCount();

    // Skip if no traces are available
    if (traceCount === 0) {
      test.skip();
      return;
    }

    await test.step('Click on first trace row to expand', async () => {
      // Get the first trace row's testid
      const firstTraceRow = page.locator('[data-testid^="trace-row-"]').first();
      await expect(firstTraceRow).toBeVisible();
      await firstTraceRow.click();
    });

    await test.step('Verify child spans are displayed', async () => {
      // Wait for spans to load and appear
      await tracePage.verifySpansVisible();

      const spanCount = await tracePage.getSpanCount();
      expect(spanCount).toBeGreaterThan(0);
    });
  });

  test('should collapse expanded trace row', async ({ page }) => {
    const tracePage = new TracePage(page);

    const traceCount = await tracePage.getTraceCount();

    // Skip if no traces are available
    if (traceCount === 0) {
      test.skip();
      return;
    }

    await test.step('Expand trace', async () => {
      const firstTraceRow = page.locator('[data-testid^="trace-row-"]').first();
      await firstTraceRow.click();
      await tracePage.verifySpansVisible();
    });

    await test.step('Collapse trace', async () => {
      // Click the same trace row again to collapse
      const firstTraceRow = page.locator('[data-testid^="trace-row-"]').first();
      await firstTraceRow.click();

      // Wait for collapse animation
      await page.waitForTimeout(300);

      // Span rows should no longer be visible (or at least fewer)
      const spanCount = await tracePage.getSpanCount();
      // After collapsing, there should be no span rows visible
      // (unless another trace is expanded)
      expect(spanCount).toBe(0);
    });
  });
});

test.describe('Traces Page - Span Details', () => {
  test('should show span details panel when clicking a span', async ({ page }) => {
    const tracePage = new TracePage(page);
    await tracePage.goto();
    await tracePage.waitForLoad();

    const traceCount = await tracePage.getTraceCount();

    // Skip if no traces are available
    if (traceCount === 0) {
      test.skip();
      return;
    }

    await test.step('Expand a trace to show spans', async () => {
      const firstTraceRow = page.locator('[data-testid^="trace-row-"]').first();
      await firstTraceRow.click();
      await tracePage.verifySpansVisible();
    });

    await test.step('Click on a span to open details panel', async () => {
      const firstSpanRow = page.locator('[data-testid^="span-row-"]').first();
      await expect(firstSpanRow).toBeVisible();
      await firstSpanRow.click();
    });

    await test.step('Verify details panel is shown', async () => {
      await tracePage.verifyDetailsPanelVisible();
    });
  });
});

test.describe('Traces Page - Accessibility', () => {
  test('should have accessible sort button with descriptive aria-label', async ({ page }) => {
    const tracePage = new TracePage(page);
    await tracePage.goto();

    const sortButton = page.getByTestId('traces-sort-toggle');
    await expect(sortButton).toBeVisible();

    // Check aria-label contains meaningful information
    const ariaLabel = await sortButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain('time');
  });

  test('should be keyboard navigable', async ({ page }) => {
    const tracePage = new TracePage(page);
    await tracePage.goto();
    await tracePage.waitForLoad();

    const traceCount = await tracePage.getTraceCount();

    // Skip if no traces are available
    if (traceCount === 0) {
      test.skip();
      return;
    }

    await test.step('Focus and activate trace row with keyboard', async () => {
      const firstTraceRow = page.locator('[data-testid^="trace-row-"]').first();

      // Focus the trace row
      await firstTraceRow.focus();

      // Press Enter or Space to expand
      await page.keyboard.press('Enter');

      // Verify spans are shown
      await tracePage.verifySpansVisible();
    });

    await test.step('Navigate to span with keyboard', async () => {
      const firstSpanRow = page.locator('[data-testid^="span-row-"]').first();

      // Focus the span row
      await firstSpanRow.focus();

      // Press Enter to open details
      await page.keyboard.press('Enter');

      // Verify details panel opens
      await tracePage.verifyDetailsPanelVisible();
    });
  });
});
