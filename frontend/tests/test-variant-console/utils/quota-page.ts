import { expect, type Page } from '@playwright/test';

/**
 * Page Object Model for Quotas pages
 * Encapsulates common quota-related operations for E2E tests
 */
export class QuotaPage {
  constructor(protected page: Page) {}

  /**
   * Navigation methods
   */
  async goToQuotasList() {
    const baseURL = this.page.context().baseURL || 'http://localhost:3000';
    await this.page.goto(`${baseURL}/quotas`);
    await expect(this.page.getByRole('heading', { name: 'Quotas' })).toBeVisible();
  }

  /**
   * Verification methods
   */
  async verifyQuotaExists(entityName: string) {
    await expect(this.page.getByText(entityName)).toBeVisible();
  }

  async verifyQuotaNotExists(entityName: string) {
    await expect(this.page.getByText(entityName)).not.toBeVisible();
  }

  async verifyEntityType(entityType: 'client-id' | 'user' | 'ip') {
    const cells = await this.page.locator('td').allTextContents();
    expect(cells).toContain(entityType);
  }

  async verifyProducerRate(rateValue: string, entityName?: string) {
    if (entityName) {
      // Find the row containing the entity name and verify the rate value is in that row
      const row = this.page.locator('tr').filter({ hasText: entityName });
      await expect(row.locator('td').filter({ hasText: rateValue })).toBeVisible();
    } else {
      await expect(this.page.getByText(rateValue)).toBeVisible();
    }
  }

  async verifyConsumerRate(rateValue: string, entityName?: string) {
    if (entityName) {
      const row = this.page.locator('tr').filter({ hasText: entityName });
      await expect(row.locator('td').filter({ hasText: rateValue })).toBeVisible();
    } else {
      await expect(this.page.getByText(rateValue)).toBeVisible();
    }
  }

  async verifyControllerMutationRate(rateValue: string, entityName?: string) {
    if (entityName) {
      const row = this.page.locator('tr').filter({ hasText: entityName });
      await expect(row.locator('td').filter({ hasText: rateValue })).toBeVisible();
    } else {
      await expect(this.page.getByText(rateValue)).toBeVisible();
    }
  }

  /**
   * Check if a specific entity name appears in the table
   */
  async verifyQuotaInTable(entityName: string, entityType: 'client-id' | 'user' | 'ip') {
    const cells = await this.page.locator('td').allTextContents();
    expect(cells).toContain(entityName);
    expect(cells).toContain(entityType);
  }

  /**
   * Reload the page and wait for quotas to load
   */
  async reloadPage() {
    const baseURL = this.page.context().baseURL || 'http://localhost:3000';
    await this.page.goto(`${baseURL}/quotas`);
    await expect(this.page.getByRole('heading', { name: 'Quotas' })).toBeVisible();
  }

  /**
   * Pagination methods
   */
  async hasPagination(): Promise<boolean> {
    return this.page
      .getByText(/Page \d+ of \d+/)
      .isVisible()
      .catch(() => false);
  }

  async getCurrentPageNumber(): Promise<number> {
    const paginationText = await this.page.getByText(/Page \d+ of \d+/).textContent();
    if (!paginationText) return 1;
    const match = paginationText.match(/Page (\d+) of \d+/);
    return match ? Number.parseInt(match[1]) : 1;
  }

  async getTotalPageCount(): Promise<number> {
    const paginationText = await this.page.getByText(/Page \d+ of \d+/).textContent();
    if (!paginationText) return 1;
    const match = paginationText.match(/Page \d+ of (\d+)/);
    return match ? Number.parseInt(match[1]) : 1;
  }

  async goToNextPage() {
    await this.page.getByRole('button', { name: 'Go to next page' }).click();
    await this.page.waitForTimeout(300); // Brief wait for table to update
  }

  async goToPreviousPage() {
    await this.page.getByRole('button', { name: 'Go to previous page' }).click();
    await this.page.waitForTimeout(300);
  }

  async goToFirstPage() {
    await this.page.getByRole('button', { name: 'Go to first page' }).click();
    await this.page.waitForTimeout(300);
  }

  async goToLastPage() {
    await this.page.getByRole('button', { name: 'Go to last page' }).click();
    await this.page.waitForTimeout(300);
  }

  async setRowsPerPage(rows: 10 | 20 | 25 | 30 | 40 | 50) {
    const selectTrigger = this.page.locator('button[role="combobox"]').filter({ hasText: /\d+/ });
    await selectTrigger.click();
    await this.page.getByRole('option', { name: rows.toString() }).click();
    await this.page.waitForTimeout(300);
  }

  async countQuotasOnCurrentPage(filterText?: string): Promise<number> {
    const locator = filterText
      ? this.page.locator('tr').filter({ hasText: filterText })
      : this.page.locator('tbody tr');
    return locator.count();
  }

  async countQuotasAcrossAllPages(filterText?: string): Promise<number> {
    const hasPagination = await this.hasPagination();

    if (!hasPagination) {
      return this.countQuotasOnCurrentPage(filterText);
    }

    const totalPages = await this.getTotalPageCount();
    let totalCount = 0;

    // Go to first page
    await this.goToFirstPage();

    for (let i = 1; i <= totalPages; i++) {
      const count = await this.countQuotasOnCurrentPage(filterText);
      totalCount += count;

      if (i < totalPages) {
        await this.goToNextPage();
      }
    }

    return totalCount;
  }
}
