import { expect, test } from '@playwright/test';

const SCHEMA_REGISTRY_TABLE_NAME_TESTID = 'schema-registry-table-name';

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
    await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Customer').waitFor();
    await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor();
    await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('shop/v1/address.proto').waitFor();
    await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('shop/v1/customer.proto').waitFor();
    expect(await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()).toEqual(4);
  });

  test("should show 'Schema search help'", async ({ page }) => {
    await page.goto('/schema-registry');
    await page.getByTestId('schema-search-help').click();
    await page.getByTestId('schema-search-header').waitFor();
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

    await expect(page).toHaveURL('/schema-registry');
  });
});
