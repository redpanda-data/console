/**
 * E2E tests for Transcripts page workflow
 *
 * Note: These tests require transcript data to be present in the system.
 * They test the UI interactions and navigation, not transcript data creation.
 */

import { expect, test } from '@playwright/test';

import { TranscriptPage } from '../../console/utils/transcript-page';

test.describe('Transcripts Page - Navigation and UI', () => {
  test('should navigate to transcripts page and display UI elements', async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);
    await transcriptPage.goto();

    await test.step('Verify page loaded with required elements', async () => {
      await transcriptPage.verifyPageLoaded();

      // Verify search input exists
      await expect(page.getByPlaceholder(/search transcripts/i)).toBeVisible();

      // Verify column headers exist
      await expect(page.getByTestId('transcripts-sort-toggle')).toBeVisible();
      await expect(page.getByText('Span', { exact: true })).toBeVisible();
      await expect(page.getByText('Duration')).toBeVisible();
    });
  });

  test('should toggle sort order between newest and oldest', async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);
    await transcriptPage.goto();

    await test.step('Verify initial sort order is newest first', async () => {
      await transcriptPage.verifySortOrder('newest');
    });

    await test.step('Toggle to oldest first', async () => {
      await transcriptPage.toggleSortOrder();
      await transcriptPage.verifySortOrder('oldest');
    });

    await test.step('Toggle back to newest first', async () => {
      await transcriptPage.toggleSortOrder();
      await transcriptPage.verifySortOrder('newest');
    });
  });
});

test.describe('Transcripts Page - Filtering', () => {
  test('should filter transcripts by search query', async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);
    await transcriptPage.goto();
    await transcriptPage.waitForLoad();

    const initialCount = await transcriptPage.getTranscriptCount();

    // Skip if no transcripts are available
    if (initialCount === 0) {
      test.skip();
      return;
    }

    await test.step('Apply search filter', async () => {
      // Use a search term that likely won't match any transcripts
      await transcriptPage.searchTranscripts('nonexistent-transcript-xyz-12345');

      // Wait for filter to apply
      await page.waitForTimeout(500);
    });

    await test.step('Verify filtered results', async () => {
      const filteredCount = await transcriptPage.getTranscriptCount();
      // Either no results or fewer results than before
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    });

    await test.step('Clear search and verify all transcripts return', async () => {
      await transcriptPage.clearSearch();
      await page.waitForTimeout(500);

      const restoredCount = await transcriptPage.getTranscriptCount();
      expect(restoredCount).toBe(initialCount);
    });
  });
});

test.describe('Transcripts Page - Transcript Expansion', () => {
  test.beforeEach(async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);
    await transcriptPage.goto();
    await transcriptPage.waitForLoad();
  });

  test('should expand transcript row to show child spans', async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);

    const transcriptCount = await transcriptPage.getTranscriptCount();

    // Skip if no transcripts are available
    if (transcriptCount === 0) {
      test.skip();
      return;
    }

    await test.step('Click on first transcript row to expand', async () => {
      // Get the first transcript row's testid
      const firstTranscriptRow = page.locator('[data-testid^="transcript-row-"]').first();
      await expect(firstTranscriptRow).toBeVisible();
      await firstTranscriptRow.click();
    });

    await test.step('Verify child spans are displayed', async () => {
      // Wait for spans to load and appear
      await transcriptPage.verifySpansVisible();

      const spanCount = await transcriptPage.getSpanCount();
      expect(spanCount).toBeGreaterThan(0);
    });
  });

  test('should collapse expanded transcript row', async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);

    const transcriptCount = await transcriptPage.getTranscriptCount();

    // Skip if no transcripts are available
    if (transcriptCount === 0) {
      test.skip();
      return;
    }

    await test.step('Expand transcript', async () => {
      const firstTranscriptRow = page.locator('[data-testid^="transcript-row-"]').first();
      await firstTranscriptRow.click();
      await transcriptPage.verifySpansVisible();
    });

    await test.step('Collapse transcript', async () => {
      // Click the same transcript row again to collapse
      const firstTranscriptRow = page.locator('[data-testid^="transcript-row-"]').first();
      await firstTranscriptRow.click();

      // Wait for collapse animation
      await page.waitForTimeout(300);

      // Span rows should no longer be visible (or at least fewer)
      const spanCount = await transcriptPage.getSpanCount();
      // After collapsing, there should be no span rows visible
      // (unless another transcript is expanded)
      expect(spanCount).toBe(0);
    });
  });
});

test.describe('Transcripts Page - Span Details', () => {
  test('should show span details panel when clicking a span', async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);
    await transcriptPage.goto();
    await transcriptPage.waitForLoad();

    const transcriptCount = await transcriptPage.getTranscriptCount();

    // Skip if no transcripts are available
    if (transcriptCount === 0) {
      test.skip();
      return;
    }

    await test.step('Expand a transcript to show spans', async () => {
      const firstTranscriptRow = page.locator('[data-testid^="transcript-row-"]').first();
      await firstTranscriptRow.click();
      await transcriptPage.verifySpansVisible();
    });

    await test.step('Click on a span to open details panel', async () => {
      const firstSpanRow = page.locator('[data-testid^="span-row-"]').first();
      await expect(firstSpanRow).toBeVisible();
      await firstSpanRow.click();
    });

    await test.step('Verify details panel is shown', async () => {
      await transcriptPage.verifyDetailsPanelVisible();
    });
  });
});

test.describe('Transcripts Page - Accessibility', () => {
  test('should have accessible sort button with descriptive aria-label', async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);
    await transcriptPage.goto();

    const sortButton = page.getByTestId('transcripts-sort-toggle');
    await expect(sortButton).toBeVisible();

    // Check aria-label contains meaningful information
    const ariaLabel = await sortButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain('time');
  });

  test('should be keyboard navigable', async ({ page }) => {
    const transcriptPage = new TranscriptPage(page);
    await transcriptPage.goto();
    await transcriptPage.waitForLoad();

    const transcriptCount = await transcriptPage.getTranscriptCount();

    // Skip if no transcripts are available
    if (transcriptCount === 0) {
      test.skip();
      return;
    }

    await test.step('Focus and activate transcript row with keyboard', async () => {
      const firstTranscriptRow = page.locator('[data-testid^="transcript-row-"]').first();

      // Focus the transcript row
      await firstTranscriptRow.focus();

      // Press Enter or Space to expand
      await page.keyboard.press('Enter');

      // Verify spans are shown
      await transcriptPage.verifySpansVisible();
    });

    await test.step('Navigate to span with keyboard', async () => {
      const firstSpanRow = page.locator('[data-testid^="span-row-"]').first();

      // Focus the span row
      await firstSpanRow.focus();

      // Press Enter to open details
      await page.keyboard.press('Enter');

      // Verify details panel opens
      await transcriptPage.verifyDetailsPanelVisible();
    });
  });
});
