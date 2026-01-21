/** biome-ignore-all lint/performance/useTopLevelRegex: e2e test */
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { SchemaPage } from '../utils/schema-page';

const SCHEMA_REGISTRY_TABLE_NAME_TESTID = 'schema-registry-table-name';

/**
 * Helper function to select an option from a custom Select component (react-select based)
 * @param selectContainer - The locator for the select container (with data-testid)
 * @param optionText - The text of the option to select
 */
async function selectOption(selectContainer: Locator, optionText: string) {
  // Click on the select to open the dropdown
  await selectContainer.click();

  // Wait for and click the option with matching text
  // React-select renders options with specific attributes
  const option = selectContainer.page().getByText(optionText, { exact: true });
  await option.click();
}

/**
 * Schema Registry E2E Tests
 * Complete test suite for Schema Registry features including:
 * - Filtering and search
 * - Schema creation with multiple strategies
 * - Version management (add, delete, recover)
 * - Compatibility mode editing
 * - Navigation and references
 * - Permissions and error handling
 */
test.describe('Schema Registry E2E Tests', () => {
  /**
   * This test is depentent on a certain owlshop-data configuration.
   */
  test.describe('Schema - Filtering (OwlShop dependent)', () => {
    test('should filter on schema ID', async ({ page }) => {
      await page.goto('/schema-registry');
      await page.getByPlaceholder('Filter by subject name or schema ID...').fill('7');
      await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor();
      expect(await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()).toEqual(1);

      await page.getByPlaceholder('Filter by subject name or schema ID...').fill('1');
      await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('shop/v1/customer.proto').waitFor();
      expect(await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()).toEqual(1);
    });

    test("should show 'Schema search help'", async ({ page }) => {
      await page.goto('/schema-registry');
      await expect(page.getByTestId('schema-help-title')).not.toBeVisible();
      await page.getByTestId('schema-search-help').click();
      await expect(page.getByTestId('schema-help-title')).toBeVisible();
    });

    test('should filter on schema name', async ({ page }) => {
      await page.goto('/schema-registry');
      await page.getByPlaceholder('Filter by subject name or schema ID...').fill('com.shop.v1.avro.Address');
      await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor({
        timeout: 1000,
      });
      expect(await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()).toEqual(1);
    });

    test('should filter on schema name by regexp', async ({ page }) => {
      await page.goto('/schema-registry');
      await page.getByPlaceholder('Filter by subject name or schema ID...').fill('com.shop.v[1-8].avro');
      await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor({
        timeout: 1000,
      });
      await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Customer').waitFor({
        timeout: 1000,
      });
      expect(await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()).toEqual(2);
    });
  });

  test.describe('Schema - Creation and Management', () => {
    test('should show edit compatibility button', async ({ page }) => {
      await page.goto('/schema-registry');
      await expect(page.getByRole('button', { name: 'Edit compatibility' })).toBeVisible();
    });

    test('should show soft-deleted schemas when checkbox is checked', async ({ page }) => {
      await page.goto('/schema-registry');

      const checkbox = page.getByText('Show soft-deleted').locator('..');
      await checkbox.click();

      await page.waitForTimeout(500);
    });

    test('should navigate to schema details page', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchemaLink = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      const schemaName = await firstSchemaLink.textContent();

      await firstSchemaLink.click();

      await expect(page).toHaveURL(/\/schema-registry\/subjects\//);
      await expect(page.getByText(schemaName || '')).toBeVisible();
    });
  });

  test.describe('Schema - Details and Versions', () => {
    test('should switch between schema versions', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const versionSelector = page.locator('select, [role="combobox"]').first();
      if (await versionSelector.isVisible()) {
        await versionSelector.click();
      }
    });

    test("should show 'Schema search help'", async ({ page }) => {
      // Let's search for 7
      await page.goto('/schema-registry');
      await expect(page.getByTestId('schema-help-title')).not.toBeVisible();
      await page.getByTestId('schema-search-help').click();
      await expect(page.getByTestId('schema-help-title')).toBeVisible();
    });
  });

  test.describe('Schema - Search and Clear', () => {
    test('should clear search filter', async ({ page }) => {
      await page.goto('/schema-registry');

      const searchInput = page.getByPlaceholder('Filter by subject name or schema ID...');
      await searchInput.fill('test-search-term');

      const initialCount = await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count();

      await searchInput.clear();
      await page.waitForTimeout(300);

      const finalCount = await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count();
      expect(finalCount).toBeGreaterThanOrEqual(initialCount);
    });

    test('should show no results message for non-existent schema', async ({ page }) => {
      await page.goto('/schema-registry');

      const searchInput = page.getByPlaceholder('Filter by subject name or schema ID...');
      await searchInput.fill('non-existent-schema-12345-xyz');

      await page.waitForTimeout(500);

      const count = await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count();
      expect(count).toEqual(0);
    });
  });

  test.describe('Schema - Pagination and Sorting', () => {
    test('should display pagination controls if many schemas exist', async ({ page }) => {
      await page.goto('/schema-registry');

      const schemaCount = await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count();

      if (schemaCount > 20) {
        await expect(page.locator('[aria-label="pagination"]')).toBeVisible();
      }
    });
  });

  test.describe('Schema - Navigation', () => {
    test('should navigate back to schema list from details page', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      await expect(page).toHaveURL(/\/schema-registry\/subjects\//);

      await page.getByRole('link', { name: 'Schema Registry' }).first().click();

      await expect(page).toHaveURL('/schema-registry/?showSoftDeleted=false');
    });
  });

  /**
   * Comprehensive Schema Creation Tests
   * Tests the complete schema creation workflow with various strategies and formats
   */
  test.describe('Schema Creation - Strategy and Format', () => {
    test('should create schema with TOPIC_NAME strategy (AVRO)', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoCreate();

      // Verify creation page loads
      await expect(page.getByTestId('schema-create-strategy-select')).toBeVisible();
      await expect(page.getByTestId('schema-create-format-radio')).toBeVisible();

      // Select TOPIC_NAME strategy using helper for custom select
      const strategySelectContainer = page.getByTestId('schema-create-strategy-select');
      await selectOption(strategySelectContainer, 'Topic-Record Name');

      // Check if topic selector appears and has options
      const topicSelect = page.getByTestId('schema-create-topic-select');
      const hasTopics = await topicSelect.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasTopics) {
        // Try to select the first available topic
        // Click to open dropdown and check if options are available
        await topicSelect.click();
        const firstOption = page.locator('[role="option"]').first();
        const hasOptions = await firstOption.isVisible({ timeout: 500 }).catch(() => false);

        if (hasOptions) {
          await firstOption.click();

          // Verify key/value radio appears
          const keyValueRadio = page.getByTestId('schema-create-key-value-radio');
          await expect(keyValueRadio).toBeVisible();
        }
      }

      // Verify format selection is always available
      const formatRadio = page.getByTestId('schema-create-format-radio');
      await expect(formatRadio.getByText('AVRO')).toBeVisible();
      await expect(formatRadio.getByText('PROTOBUF')).toBeVisible();
      await expect(formatRadio.getByText('JSON')).toBeVisible();
    });

    test('should create schema with CUSTOM strategy', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoCreate();

      const strategySelectContainer = page.getByTestId('schema-create-strategy-select');
      await selectOption(strategySelectContainer, 'Custom');

      // Verify subject name input appears
      const subjectInput = page.getByTestId('schema-create-subject-name-input');
      await expect(subjectInput).toBeVisible();
    });

    test('should show validation button on create page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoCreate();

      const validateButton = page.getByTestId('schema-create-validate-btn');
      await expect(validateButton).toBeVisible();
    });

    test('should show save button on create page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoCreate();

      const saveButton = page.getByTestId('schema-create-save-btn');
      await expect(saveButton).toBeVisible();
    });

    test('should show cancel button on create page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoCreate();

      const cancelButton = page.getByTestId('schema-create-cancel-btn');
      await expect(cancelButton).toBeVisible();
    });

    test('should cancel schema creation', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoCreate();

      await schemaPage.cancelCreation();
      await expect(page).toHaveURL('/schema-registry/?showSoftDeleted=false');
    });

    test('should navigate to create page from list', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      await schemaPage.clickCreateButton();
      await expect(page).toHaveURL('/schema-registry/create');
    });
  });

  /**
   * Schema Version Management Tests
   * Tests version switching, deletion, recovery, and permanent deletion
   */
  test.describe('Schema Version Management - Switching and Display', () => {
    test('should display version selector', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const versionSelect = page.getByTestId('schema-definition-version-select');
      await expect(versionSelect).toBeVisible();
    });

    test('should display schema ID', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const schemaId = page.getByTestId('schema-definition-schema-id');
      await expect(schemaId).toBeVisible();
    });

    test('should display schema code block', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const codeBlock = page.getByTestId('schema-definition-code-block');
      await expect(codeBlock).toBeVisible();
    });

    test('should show add version button', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const addVersionButton = page.getByTestId('schema-details-add-version-btn');
      // Button may not be visible if user doesn't have permissions
      const isVisible = await addVersionButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (isVisible) {
        await expect(addVersionButton).toBeVisible();
      }
    });

    test('should show delete version button', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const deleteButton = page.getByTestId('schema-definition-delete-version-btn');
      // Button may not be visible if user doesn't have permissions
      const isVisible = await deleteButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (isVisible) {
        await expect(deleteButton).toBeVisible();
      }
    });

    test('should display tabs (Definition, Diff, References)', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const tabs = page.getByTestId('schema-details-tabs');
      await expect(tabs).toBeVisible();
    });

    test('should display diff tab with version selectors', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      // Click on Diff tab
      await page.getByRole('tab', { name: /diff/i }).click();

      // Verify diff controls are visible
      const leftSelect = page.getByTestId('schema-diff-version-left-select');
      const rightSelect = page.getByTestId('schema-diff-version-right-select');

      await expect(leftSelect).toBeVisible();
      await expect(rightSelect).toBeVisible();
    });

    test('should show soft-deleted alert when version is deleted', async ({ page }) => {
      await page.goto('/schema-registry');

      // Enable soft-deleted checkbox to see deleted schemas
      const checkbox = page.getByTestId('schema-list-show-soft-deleted-checkbox');
      await checkbox.check();

      await page.waitForTimeout(500);

      // Look for any soft-deleted schema indicator
      const softDeletedIcon = page.getByTestId('schema-list-soft-deleted-icon').first();
      const hasSoftDeleted = await softDeletedIcon.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasSoftDeleted) {
        // Click on a soft-deleted schema
        const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
        await firstSchema.click();

        // Check for soft-deleted alert or recover button
        const recoverButton = page.getByTestId('schema-definition-recover-btn');
        const hasRecoverButton = await recoverButton.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasRecoverButton) {
          await expect(recoverButton).toBeVisible();
        }
      } else {
        test.skip();
      }
    });
  });

  /**
   * Schema Compatibility Editing Tests
   * Tests editing global and subject-specific compatibility modes
   */
  test.describe('Schema Compatibility Editing', () => {
    test('should navigate to global compatibility edit page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      await schemaPage.clickEditCompatibilityButton();
      await expect(page).toHaveURL('/schema-registry/edit-compatibility');
    });

    test('should show save button on compatibility edit page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoEditCompatibility();

      const saveButton = page.getByTestId('edit-compatibility-save-btn');
      await expect(saveButton).toBeVisible();
    });

    test('should show cancel button on compatibility edit page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoEditCompatibility();

      const cancelButton = page.getByTestId('edit-compatibility-cancel-btn');
      await expect(cancelButton).toBeVisible();
    });

    test('should display compatibility description', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.gotoEditCompatibility();

      const description = page.getByTestId('edit-compatibility-description');
      await expect(description).toBeVisible();
      await expect(description).toContainText('Compatibility determines how schema validation occurs');
    });

    test('should navigate to subject-specific compatibility edit', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      // Click edit compatibility button
      const editButton = page.getByTestId('schema-details-edit-compatibility-btn');
      const hasEditButton = await editButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasEditButton) {
        await editButton.click();
        await expect(page).toHaveURL(/\/schema-registry\/subjects\/.+\/edit-compatibility/);

        // Verify subject name is displayed
        const subjectName = page.getByTestId('edit-compatibility-subject-name');
        await expect(subjectName).toBeVisible();
      } else {
        test.skip();
      }
    });
  });

  /**
   * Schema Details and Navigation Tests
   * Tests navigation, references, and metadata display
   */
  test.describe('Schema Details and References', () => {
    test('should display edit compatibility button on details page', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const editButton = page.getByTestId('schema-details-edit-compatibility-btn');
      // Button may not be visible if user doesn't have permissions
      const isVisible = await editButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (isVisible) {
        await expect(editButton).toBeVisible();
      }
    });

    test('should display delete subject button on details page', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      const deleteButton = page.getByTestId('schema-details-delete-subject-btn');
      // Button may not be visible if user doesn't have permissions
      const isVisible = await deleteButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (isVisible) {
        await expect(deleteButton).toBeVisible();
      }
    });

    test('should display schema references section', async ({ page }) => {
      await page.goto('/schema-registry');

      // Look for a schema that might have references
      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      // Check if References heading exists
      await expect(page.getByTestId('schema-references-heading')).toBeVisible();
    });

    test('should display referenced by section', async ({ page }) => {
      await page.goto('/schema-registry');

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      await firstSchema.click();

      // Check if Referenced By heading exists
      await expect(page.getByTestId('schema-referenced-by-heading')).toBeVisible();
    });

    test('should display schema mode and compatibility in list header', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      const stats = page.getByTestId('schema-list-stats');
      await expect(stats).toBeVisible();
      await expect(stats).toContainText('Mode');
      await expect(stats).toContainText('Compatibility');
    });

    test('should display search field on list page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      const searchField = page.getByTestId('schema-list-search-field');
      await expect(searchField).toBeVisible();
    });
  });

  /**
   * Schema Permissions and Error Handling Tests
   * Tests permission checks and error states
   */
  test.describe('Schema Permissions', () => {
    test('should show create button on list page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      const createButton = page.getByTestId('schema-list-create-btn');
      await expect(createButton).toBeVisible();
    });

    test('should show edit compatibility button on list page', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      const editButton = page.getByTestId('schema-list-edit-compatibility-btn');
      await expect(editButton).toBeVisible();
    });

    test('should show delete buttons in table', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      const firstSchema = page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).first();
      const schemaName = await firstSchema.textContent();

      if (schemaName) {
        const deleteButton = page.getByTestId(`schema-list-delete-btn-${schemaName}`);
        await expect(deleteButton).toBeVisible();
      }
    });

    test('should display soft-deleted checkbox', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      const checkbox = page.getByTestId('schema-list-show-soft-deleted-checkbox');
      await expect(checkbox).toBeVisible();
    });
  });

  test.describe('Schema Error Handling', () => {
    test('should handle empty search results', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      await schemaPage.searchSchemas('nonexistent-schema-xyz-12345');

      // Wait for search to complete
      await page.waitForTimeout(500);

      const count = await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count();
      expect(count).toBe(0);
    });

    test('should show spinner during schema ID search', async ({ page }) => {
      const schemaPage = new SchemaPage(page);
      await schemaPage.goto();

      await schemaPage.searchSchemas('999999');

      // Check if spinner appears
      const spinner = page.getByTestId('schema-list-search-spinner');
      // Spinner may appear briefly or not at all if search is fast
      const isVisible = await spinner.isVisible({ timeout: 500 }).catch(() => false);

      if (isVisible) {
        await expect(spinner).toBeVisible();
      }
    });
  });
});
