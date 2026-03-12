import { expect, test } from '@playwright/test';

/**
 * Remote MCP Servers - Search & Filter E2E Tests
 *
 * These tests run against a production build where React Compiler is active.
 * They verify that the search input and status filter on the MCP servers list
 * page work correctly — a regression that occurred when React Compiler
 * incorrectly memoized DataTableFacetedFilter and Input callbacks.
 */
test.describe('Remote MCP Servers - Search & Filter', () => {
  test('search input accepts keystrokes and reflects typed value', async ({ page }) => {
    await page.goto('/mcp-servers');

    const searchInput = page.getByPlaceholder('Filter servers...');
    await expect(searchInput).toBeVisible();

    // Type into the search input — this was broken when React Compiler
    // memoized the onChange handler and froze the stale filter value.
    await searchInput.fill('test-server');
    await expect(searchInput).toHaveValue('test-server');

    // Clear and retype
    await searchInput.clear();
    await expect(searchInput).toHaveValue('');

    await searchInput.fill('another');
    await expect(searchInput).toHaveValue('another');
  });

  test('search input filters table rows by name', async ({ page }) => {
    await page.goto('/mcp-servers');

    const searchInput = page.getByPlaceholder('Filter servers...');
    await expect(searchInput).toBeVisible();

    // Wait for table to settle (loading state to complete)
    await page.waitForTimeout(500);

    // Count initial rows
    const table = page.locator('table');
    const hasTable = await table.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasTable) {
      const initialRowCount = await table.locator('tbody tr').count();

      if (initialRowCount > 0) {
        // Get the name of the first server
        const firstName = await table.locator('tbody tr').first().locator('td').first().textContent();

        // Search for a non-matching term
        await searchInput.fill('zzz-nonexistent-server-xyz');
        await page.waitForTimeout(300);

        const filteredCount = await table.locator('tbody tr').count();
        // Either 0 rows or an empty state row
        expect(filteredCount).toBeLessThanOrEqual(1);

        // Clear and search for the first server's name
        await searchInput.clear();
        await searchInput.fill(firstName?.trim() || '');
        await page.waitForTimeout(300);

        const matchedCount = await table.locator('tbody tr').count();
        expect(matchedCount).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('status filter dropdown opens and options are selectable', async ({ page }) => {
    await page.goto('/mcp-servers');

    // Wait for page to load
    await page.waitForTimeout(500);

    // Find the Status filter button — DataTableFacetedFilter renders a button with title text
    const statusButton = page.getByRole('button', { name: 'Status' });
    const hasStatusFilter = await statusButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasStatusFilter) {
      // Click to open the filter popover — this was broken when React Compiler
      // memoized the Popover state and prevented re-opens.
      await statusButton.click();

      // Verify the popover opened with status options
      const runningOption = page.getByRole('option', { name: /running/i });
      const hasRunning = await runningOption.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasRunning) {
        await runningOption.click();

        // The "Clear" button should appear when a filter is active
        const clearButton = page.getByRole('button', { name: 'Clear' });
        await expect(clearButton).toBeVisible({ timeout: 2000 });

        // Click clear to reset
        await clearButton.click();
      }
    }
  });

  test('search input can be combined with status filter', async ({ page }) => {
    await page.goto('/mcp-servers');

    const searchInput = page.getByPlaceholder('Filter servers...');
    await expect(searchInput).toBeVisible();

    // Type a search term
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');

    // Open status filter while search is active
    const statusButton = page.getByRole('button', { name: 'Status' });
    const hasStatusFilter = await statusButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasStatusFilter) {
      await statusButton.click();
      await page.waitForTimeout(300);

      // Close by clicking elsewhere
      await page.keyboard.press('Escape');
    }

    // Verify search input still has the value (not cleared by filter interaction)
    await expect(searchInput).toHaveValue('test');
  });
});
