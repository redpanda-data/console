import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for Traces page
 * Handles navigation, trace expansion, span selection, filtering, and sorting
 */
export class TracePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to the traces list page
   */
  async goto() {
    await this.page.goto('/traces');
    await expect(this.page.getByRole('heading', { name: /traces/i })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Wait for traces to load (either content or empty state)
   */
  async waitForLoad() {
    // Wait for either traces, empty state, or error state (but not loading)
    await this.page.waitForSelector(
      '[data-testid^="trace-row-"], [data-testid="traces-empty-state"], [data-testid="traces-error-state"]',
      { timeout: 10_000 }
    );
  }

  /**
   * Expand a trace row to show its spans
   * @param traceId - The trace ID to expand (partial match supported)
   */
  async expandTrace(traceId: string) {
    const traceRow = this.page.getByTestId(`trace-row-${traceId}`);
    await expect(traceRow).toBeVisible();
    await traceRow.click();
  }

  /**
   * Click on a span row to view its details
   * @param spanId - The span ID to click
   */
  async clickSpan(spanId: string) {
    const spanRow = this.page.getByTestId(`span-row-${spanId}`);
    await expect(spanRow).toBeVisible();
    await spanRow.click();
  }

  /**
   * Toggle the sort order (newest/oldest first)
   */
  async toggleSortOrder() {
    const sortButton = this.page.getByTestId('traces-sort-toggle');
    await expect(sortButton).toBeVisible();
    await sortButton.click();
  }

  /**
   * Search for traces using the search input
   * @param query - The search query
   */
  async searchTraces(query: string) {
    const searchInput = this.page.getByPlaceholder(/search traces/i);
    await searchInput.fill(query);
  }

  /**
   * Clear the search filter
   */
  async clearSearch() {
    const searchInput = this.page.getByPlaceholder(/search traces/i);
    await searchInput.clear();
  }

  /**
   * Reset all filters
   */
  async resetFilters() {
    const resetButton = this.page.getByRole('button', { name: /reset/i });
    if (await resetButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resetButton.click();
    }
  }

  /**
   * Close the span details panel
   */
  async closeDetailsPanel() {
    const closeButton = this.page.getByRole('button', { name: /close/i });
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
    }
  }

  /**
   * Verification methods
   */

  /**
   * Verify that the traces page loaded successfully
   */
  async verifyPageLoaded() {
    await expect(this.page.getByRole('heading', { name: /traces/i })).toBeVisible();
    // Verify time column header exists
    await expect(this.page.getByTestId('traces-sort-toggle')).toBeVisible();
  }

  /**
   * Verify a trace row is visible
   * @param traceId - The trace ID (partial match)
   */
  async verifyTraceVisible(traceId: string) {
    const traceRow = this.page.getByTestId(`trace-row-${traceId}`);
    await expect(traceRow).toBeVisible();
  }

  /**
   * Verify a trace row is not visible
   * @param traceId - The trace ID (partial match)
   */
  async verifyTraceNotVisible(traceId: string) {
    const traceRow = this.page.getByTestId(`trace-row-${traceId}`);
    await expect(traceRow).not.toBeVisible();
  }

  /**
   * Verify span rows are visible (trace is expanded)
   */
  async verifySpansVisible() {
    const spanRows = this.page.locator('[data-testid^="span-row-"]');
    await expect(spanRows.first()).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify the details panel is visible
   */
  async verifyDetailsPanelVisible() {
    // The details panel should contain span information
    const detailsPanel = this.page.locator('[class*="border-l"]').filter({ hasText: /attributes|duration/i });
    await expect(detailsPanel).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify the empty state is shown
   */
  async verifyEmptyState() {
    await expect(this.page.getByText(/no traces found/i)).toBeVisible();
  }

  /**
   * Verify sort order indicator
   * @param order - Expected sort order ('newest' or 'oldest')
   */
  async verifySortOrder(order: 'newest' | 'oldest') {
    const sortButton = this.page.getByTestId('traces-sort-toggle');
    const ariaLabel = await sortButton.getAttribute('aria-label');
    if (order === 'newest') {
      expect(ariaLabel).toContain('newest first');
    } else {
      expect(ariaLabel).toContain('oldest first');
    }
  }

  /**
   * Get the count of visible trace rows
   */
  async getTraceCount(): Promise<number> {
    const traceRows = this.page.locator('[data-testid^="trace-row-"]');
    return traceRows.count();
  }

  /**
   * Get the count of visible span rows
   */
  async getSpanCount(): Promise<number> {
    const spanRows = this.page.locator('[data-testid^="span-row-"]');
    return spanRows.count();
  }
}
