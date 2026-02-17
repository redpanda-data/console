# Test Patterns Reference

## Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('user can complete workflow', async ({ page }) => {
    await page.goto('/feature');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByLabel('Name').fill('test-item');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Success')).toBeVisible();
    await expect(page).toHaveURL(/\/feature\/test-item/);
  });
});
```

## Multi-Step Workflows

```typescript
test('user creates, configures, and tests topic', async ({ page }) => {
  // Step 1: Navigate and create
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Create Topic' }).click();

  // Step 2: Fill form
  await page.getByLabel('Topic Name').fill('test-topic');
  await page.getByLabel('Partitions').fill('3');
  await page.getByRole('button', { name: 'Create' }).click();

  // Step 3: Verify creation
  await expect(page.getByText('Topic created successfully')).toBeVisible();
  await expect(page).toHaveURL(/\/topics\/test-topic/);

  // Step 4: Configure topic
  await page.getByRole('button', { name: 'Configure' }).click();
  await page.getByLabel('Retention Hours').fill('24');
  await page.getByRole('button', { name: 'Save' }).click();

  // Step 5: Verify configuration
  await expect(page.getByText('Configuration saved')).toBeVisible();
});
```

## Testing Forms

```typescript
test('form validation works correctly', async ({ page }) => {
  await page.goto('/create-topic');

  // Submit empty form - should show errors
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Name is required')).toBeVisible();

  // Fill valid data - should succeed
  await page.getByLabel('Topic Name').fill('valid-topic');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Success')).toBeVisible();
});
```

## Testing Data Tables

```typescript
test('user can filter and sort topics', async ({ page }) => {
  await page.goto('/topics');

  // Filter
  await page.getByPlaceholder('Search topics').fill('test-');
  await expect(page.getByRole('row')).toHaveCount(3); // Header + 2 results

  // Sort
  await page.getByRole('columnheader', { name: 'Name' }).click();
  const firstRow = page.getByRole('row').nth(1);
  await expect(firstRow).toContainText('test-topic-a');
});
```

## API Interactions

```typescript
test('creating topic triggers backend API', async ({ page }) => {
  // Listen for API call
  const apiPromise = page.waitForResponse(
    resp => resp.url().includes('/api/topics') && resp.status() === 201
  );

  // Trigger action
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Create Topic' }).click();
  await page.getByLabel('Name').fill('api-test-topic');
  await page.getByRole('button', { name: 'Create' }).click();

  // Verify API was called
  const response = await apiPromise;
  const body = await response.json();
  expect(body.name).toBe('api-test-topic');
});
```

## Async Operations

```typescript
// Wait for specific condition
await expect(page.getByRole('status')).toHaveText('Ready');

// Wait for navigation
await page.waitForURL('**/topics/my-topic');

// Wait for API response
await page.waitForResponse(resp =>
  resp.url().includes('/api/topics') && resp.status() === 200
);

// NEVER use fixed timeouts
// await page.waitForTimeout(5000); // BAD
```

## Selectors Best Practices

```typescript
// GOOD: Role-based (accessible)
page.getByRole('button', { name: 'Create Topic' })
page.getByLabel('Topic Name')
page.getByText('Success message')

// GOOD: Test IDs when role isn't clear
page.getByTestId('topic-list-item')

// BAD: CSS selectors (brittle)
page.locator('.btn-primary')
page.locator('#topic-name-input')
```

## Adding Test IDs to Components

```tsx
// In React component
<Button data-testid="create-topic-button">Create Topic</Button>

// In test
await page.getByTestId('create-topic-button').click();
```

**Where to Add:**
1. Primary actions: Create, Save, Delete, Edit, Submit, Cancel buttons
2. Navigation: Links to detail pages, breadcrumbs
3. Forms: All input fields, selects, checkboxes, radio buttons
4. Lists/Tables: Row identifiers, action buttons within rows
5. Dialogs/Modals: Open/close buttons, form elements inside
6. Search/Filter: Search inputs, filter dropdowns, clear buttons
