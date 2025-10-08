import { expect, test } from '@playwright/test';

import { createSchema } from '../schema.utils';

const SCHEMA_REGISTRY_TABLE_NAME_TESTID = 'schema-registry-table-name';

/**
 * This test is depentent on a certain owlshop-data configuration.
 */
test.describe('Schema', () => {
  test('should filter on schema ID', async ({ page }) => {
    page.setDefaultTimeout(10_000);
    // Let's search for 7
    await page.goto('/schema-registry');
    await page.getByPlaceholder('Filter by subject name or schema ID...').fill('7');
    await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor();
    expect(await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()).toEqual(1);

    // Let's search for 1
    await page.getByPlaceholder('Filter by subject name or schema ID...').fill('1');
    await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('shop/v1/customer.proto').waitFor();
    expect(await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()).toEqual(1);
  });
  test("should show 'Schema search help'", async ({ page }) => {
    // Let's search for 7
    await page.goto('/schema-registry');
    await expect(page.getByTestId('schema-help-title')).not.toBeVisible();
    await page.getByTestId('schema-search-help').click();
    await expect(page.getByTestId('schema-help-title')).toBeVisible();
  });
  test('should filter on schema name', async ({ page }) => {
    // Let's search for 7
    await page.goto('/schema-registry');
    await page.getByPlaceholder('Filter by subject name or schema ID...').fill('com.shop.v1.avro.Address');
    await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).getByText('com.shop.v1.avro.Address').waitFor({
      timeout: 1000,
    });
    expect(await page.getByTestId(SCHEMA_REGISTRY_TABLE_NAME_TESTID).count()).toEqual(1);
  });
  test('should filter on schema name by regexp', async ({ page }) => {
    // Let's search for 7
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
