// spec: ACL User Management Tests
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

test.describe('ACL User Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Security/Users page
    await page.goto('/security/');
    await expect(page).toHaveURL('/security/users');
  });

  test('should create a new user with special characters in password', async ({ page }) => {
    // 1. Click Create user button to open user creation dialog
    await page.getByTestId('create-user-button').click();
    await expect(page).toHaveURL('/security/users/create');
    await expect(page.getByRole('heading', { name: 'Create user' })).toBeVisible();

    // 2. Fill in username field with timestamp suffix for unique test runs
    const timestamp = Date.now();
    const username = `test-user-e2e-${timestamp}`;
    const usernameInput = page.getByTestId('create-user-name');
    await usernameInput.fill(username);

    // 3. Enable special characters checkbox
    await page.locator('label').filter({ hasText: 'Generate with special' }).click();
    await expect(page.getByRole('checkbox', { name: 'Generate with special' })).toBeChecked();

    // 4. Verify Create button is enabled and submit
    const createButton = page.getByRole('button', { name: 'Create' });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // 5. Verify success message
    await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
    await expect(page.getByText(username)).toBeVisible();

    // 6. Return to users list
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL('/security/users');

    // 7. Verify user appears in the list
    await expect(page.getByRole('link', { name: username })).toBeVisible();
  });

  test('should toggle special characters checkbox and regenerate password', async ({ page }) => {
    // 1. Navigate to create user page
    await page.getByTestId('create-user-button').click();

    // 2. Get initial password value (find first input within the password field container)
    const passwordInput = page.getByTestId('create-user-password').locator('input').first();
    const initialPassword = await passwordInput.inputValue();

    await page.getByTestId('password-input-toggle').click();

    // 3. Toggle special characters checkbox on
    const specialCharsCheckbox = page.locator('label').filter({ hasText: 'Generate with special characters' });
    await specialCharsCheckbox.click();
    await expect(page.getByRole('checkbox', { name: 'Generate with special characters' })).toBeChecked();

    // 4. Verify password changed after checkbox toggle
    const passwordAfterToggle = await passwordInput.inputValue();
    expect(passwordAfterToggle).not.toBe(initialPassword);

    // 5. Toggle checkbox off
    await specialCharsCheckbox.click();
    await expect(page.getByRole('checkbox', { name: 'Generate with special' })).not.toBeChecked();

    // 6. Verify password changed again
    const finalPassword = await passwordInput.inputValue();
    expect(finalPassword).not.toBe(passwordAfterToggle);

    // Cancel and return to list
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL('/security/users');
  });

  test('should filter users by name', async ({ page }) => {
    // 1. Create a unique test user for filtering
    await page.getByTestId('create-user-button').click();
    const timestamp = Date.now();
    const username = `test-user-filter-${timestamp}`;
    await page.getByTestId('create-user-name').fill(username);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL('/security/users');

    // 2. Verify initial user list is visible
    const table = page.getByRole('table');
    await expect(table).toBeVisible();


    // 3. Get filter input
    const filterInput = page.getByTestId('search-field-input').getByRole('textbox');
    await expect(filterInput).toBeVisible();

    // 4. Filter by 'test'
    await filterInput.fill('test');

    // 5. Verify URL contains query parameter 'q=test'
    await expect(page).toHaveURL('/security/users?q=test');

    // 6. Verify filtered results - should only show users with 'test' in name
    await expect(page.getByRole('link', { name: /test-user-.*/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'e2euser', exact: true })).not.toBeVisible();

    // 7. Clear filter
    await filterInput.fill('');

    // 8. Verify URL query parameter is removed
    await expect(page).toHaveURL('/security/users');

    // 9. Verify e2euser is visible again
    await expect(page.getByRole('link', { name: 'e2euser' })).toBeVisible();
  });

  test('should filter users by partial match', async ({ page }) => {
    // 1. Create a unique test user for partial matching
    await page.getByTestId('create-user-button').click();
    const timestamp = Date.now();
    const username = `test-user-partial-${timestamp}`;
    await page.getByTestId('create-user-name').fill(username);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL('/security/users');

    // 2. Filter by 'e2e'
    const filterInput = page.getByTestId('search-field-input').getByRole('textbox');
    await filterInput.fill('e2e');

    // 3. Verify URL contains query parameter 'q=e2e'
    await expect(page).toHaveURL('/security/users?q=e2e');

    // 4. Verify only e2euser is visible
    await expect(page.getByRole('link', { name: 'e2euser' })).toBeVisible();

    // 5. Change filter to 'test'
    await filterInput.fill('test');

    // 6. Verify URL contains query parameter 'q=test'
    await expect(page).toHaveURL('/security/users?q=test');

    // 7. Verify test-user is visible
    await expect(page.getByRole('link', { name: /test-user-.*/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'e2euser', exact: true })).not.toBeVisible();

    // 8. Clear filter
    await filterInput.fill('');

    // 9. Verify URL query parameter is removed
    await expect(page).toHaveURL('/security/users');
  });

  test('should navigate to user detail page and back', async ({ page }) => {
    // 1. Create a unique test user for navigation test
    await page.getByTestId('create-user-button').click();
    const timestamp = Date.now();
    const username = `test-user-nav-${timestamp}`;
    await page.getByTestId('create-user-name').fill(username);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL('/security/users');

    // 2. Click on the created user link
    await page.getByRole('link', { name: username, exact: true }).click();

    // 3. Verify user detail page loads
    await expect(page).toHaveURL(`/security/users/${username}/details`);
    await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible();

    // 4. Verify user information section
    await expect(page.getByRole('heading', { name: 'User information' })).toBeVisible();
    await expect(page.getByText('Username')).toBeVisible();
    await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Passwords cannot be viewed')).toBeVisible();

    // 5. Verify sections are visible
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /ACLs/ })).toBeVisible();

    // 6. Navigate back using breadcrumb
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL('/security/users');

    // 7. Verify we're back on the users list
    await expect(page.getByRole('heading', { name: 'Access Control' })).toBeVisible();
    await expect(page.getByTestId('create-user-button')).toBeVisible();
  });

  test('should display user details with ACLs and roles information', async ({ page }) => {
    // 1. Create a unique test user for details test
    await page.getByTestId('create-user-button').click();
    const timestamp = Date.now();
    const username = `test-user-details-${timestamp}`;
    await page.getByTestId('create-user-name').fill(username);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL('/security/users');

    // 2. Navigate to the created user detail page
    await page.getByRole('link', { name: username, exact: true }).click();

    // 3. Verify URL and heading
    await expect(page).toHaveURL(`/security/users/${username}/details`);
    await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible();

    // 4. Verify User information section shows correct username
    await expect(page.getByText('test-user-123', { exact: false })).not.toBeVisible();
    await expect(page.getByText('User information')).toBeVisible();

    // 6. Verify Delete user button is available
    await expect(page.getByRole('button', { name: 'Delete user' })).toBeVisible();

    // 8. Navigate back to list using breadcrumb
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL('/security/users');
  });

  test('should validate username format requirements', async ({ page }) => {
    // 1. Navigate to create user page
    await page.getByTestId('create-user-button').click();

    // 2. Verify username input has help text
    await expect(
      page.getByText('Must not contain any whitespace. Dots, hyphens and underscores may be used.')
    ).toBeVisible();

    // 3. Fill in valid username with allowed characters
    const usernameInput = page.getByTestId('create-user-name');
    await usernameInput.fill('valid-user.name_123');

    // 4. Verify Create button becomes enabled
    await expect(page.getByRole('button', { name: 'Create' })).toBeEnabled();

    // Cancel and return
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('should display password requirements', async ({ page }) => {
    // 1. Navigate to create user page
    await page.getByTestId('create-user-button').click();

    // 2. Verify password requirements are displayed
    await expect(page.getByText('Must be at least 4 characters and should not exceed 64 characters.')).toBeVisible();

    // 3. Verify password field has auto-generated value (find first input within the container)
    const passwordInput = page.getByTestId('create-user-password').locator('input').first();
    const passwordValue = await passwordInput.inputValue();
    expect(passwordValue.length).toBeGreaterThan(0);

    // 4. Verify refresh button is available
    await expect(page.locator('button[aria-label="Refresh"]')).toBeVisible();

    // 5. Verify copy button is available
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();

    // Cancel and return
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
