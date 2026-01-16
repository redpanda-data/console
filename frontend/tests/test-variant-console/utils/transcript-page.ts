import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for Transcripts page
 * Handles navigation, transcript expansion, span selection, filtering, and sorting
 */
export class TranscriptPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to the transcripts list page
   */
  async goto() {
    await this.page.goto('/transcripts');
    await expect(this.page.getByRole('heading', { name: /transcripts/i })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Wait for transcripts to load (either content or empty state)
   */
  async waitForLoad() {
    // Wait for either transcripts, empty state, or error state (but not loading)
    await this.page.waitForSelector(
      '[data-testid^="transcript-row-"], [data-testid="transcripts-empty-state"], [data-testid="transcripts-error-state"]',
      { timeout: 10_000 }
    );
  }

  /**
   * Expand a transcript row to show its spans
   * @param transcriptId - The transcript ID to expand (partial match supported)
   */
  async expandTranscript(transcriptId: string) {
    const transcriptRow = this.page.getByTestId(`transcript-row-${transcriptId}`);
    await expect(transcriptRow).toBeVisible();
    await transcriptRow.click();
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
    const sortButton = this.page.getByTestId('transcripts-sort-toggle');
    await expect(sortButton).toBeVisible();
    await sortButton.click();
  }

  /**
   * Search for transcripts using the search input
   * @param query - The search query
   */
  async searchTranscripts(query: string) {
    const searchInput = this.page.getByPlaceholder(/search transcripts/i);
    await searchInput.fill(query);
  }

  /**
   * Clear the search filter
   */
  async clearSearch() {
    const searchInput = this.page.getByPlaceholder(/search transcripts/i);
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
   * Verify that the transcripts page loaded successfully
   */
  async verifyPageLoaded() {
    await expect(this.page.getByRole('heading', { name: /transcripts/i })).toBeVisible();
    // Verify time column header exists
    await expect(this.page.getByTestId('transcripts-sort-toggle')).toBeVisible();
  }

  /**
   * Verify a transcript row is visible
   * @param transcriptId - The transcript ID (partial match)
   */
  async verifyTranscriptVisible(transcriptId: string) {
    const transcriptRow = this.page.getByTestId(`transcript-row-${transcriptId}`);
    await expect(transcriptRow).toBeVisible();
  }

  /**
   * Verify a transcript row is not visible
   * @param transcriptId - The transcript ID (partial match)
   */
  async verifyTranscriptNotVisible(transcriptId: string) {
    const transcriptRow = this.page.getByTestId(`transcript-row-${transcriptId}`);
    await expect(transcriptRow).not.toBeVisible();
  }

  /**
   * Verify span rows are visible (transcript is expanded)
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
    await expect(this.page.getByText(/no transcripts found/i)).toBeVisible();
  }

  /**
   * Verify sort order indicator
   * @param order - Expected sort order ('newest' or 'oldest')
   */
  async verifySortOrder(order: 'newest' | 'oldest') {
    const sortButton = this.page.getByTestId('transcripts-sort-toggle');
    const ariaLabel = await sortButton.getAttribute('aria-label');
    if (order === 'newest') {
      expect(ariaLabel).toContain('newest first');
    } else {
      expect(ariaLabel).toContain('oldest first');
    }
  }

  /**
   * Get the count of visible transcript rows
   */
  async getTranscriptCount(): Promise<number> {
    const transcriptRows = this.page.locator('[data-testid^="transcript-row-"]');
    return transcriptRows.count();
  }

  /**
   * Get the count of visible span rows
   */
  async getSpanCount(): Promise<number> {
    const spanRows = this.page.locator('[data-testid^="span-row-"]');
    return spanRows.count();
  }
}
