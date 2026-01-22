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
}
