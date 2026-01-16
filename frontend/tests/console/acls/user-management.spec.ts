// spec: ACL User Management Tests
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

test.describe('ACL User Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Security/Users page
    await page.goto('/security/', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL('/security/users');
  });

  test('should create a new user with special characters in password', async ({ page }) => {
    await test.step('1. Click Create user button to open user creation dialog', async () => {
      await page.getByTestId('create-user-button').click();
      await expect(page).toHaveURL('/security/users/create');
      await expect(page.getByRole('heading', { name: 'Create user' })).toBeVisible();
    });

    const timestamp = Date.now();
    const username = `test-user-e2e-${timestamp}`;

    await test.step('2. Fill in username field with timestamp suffix for unique test runs', async () => {
      const usernameInput = page.getByTestId('create-user-name');
      await usernameInput.fill(username);
    });

    await test.step('3. Enable special characters checkbox', async () => {
      await page.locator('label').filter({ hasText: 'Generate with special' }).click();
      await expect(page.getByRole('checkbox', { name: 'Generate with special' })).toBeChecked();
    });

    await test.step('4. Verify Create button is enabled and submit', async () => {
      const createButton = page.getByRole('button', { name: 'Create' });
      await expect(createButton).toBeEnabled();
      await createButton.click();
    });

    await test.step('5. Verify success message', async () => {
      await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
      await expect(page.getByText(username)).toBeVisible();
    });

    await test.step('6. Return to users list', async () => {
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('7. Verify user appears in the list', async () => {
      await expect(page.getByRole('link', { name: username })).toBeVisible();
    });
  });

  test('should toggle special characters checkbox and regenerate password', async ({ page }) => {
    await test.step('1. Navigate to create user page', async () => {
      await page.getByTestId('create-user-button').click();
    });

    const passwordInput = page.getByTestId('create-user-password').locator('input').first();
    let initialPassword: string;
    let passwordAfterToggle: string;

    await test.step('2. Get initial password value', async () => {
      initialPassword = await passwordInput.inputValue();
      await page.getByTestId('password-input-toggle').click();
    });

    await test.step('3. Toggle special characters checkbox on', async () => {
      const specialCharsCheckbox = page.locator('label').filter({ hasText: 'Generate with special characters' });
      await specialCharsCheckbox.click();
      await expect(page.getByRole('checkbox', { name: 'Generate with special characters' })).toBeChecked();
    });

    await test.step('4. Verify password changed after checkbox toggle', async () => {
      passwordAfterToggle = await passwordInput.inputValue();
      expect(passwordAfterToggle).not.toBe(initialPassword);
    });

    await test.step('5. Toggle checkbox off', async () => {
      const specialCharsCheckbox = page.locator('label').filter({ hasText: 'Generate with special characters' });
      await specialCharsCheckbox.click();
      await expect(page.getByRole('checkbox', { name: 'Generate with special' })).not.toBeChecked();
    });

    await test.step('6. Verify password changed again', async () => {
      const finalPassword = await passwordInput.inputValue();
      expect(finalPassword).not.toBe(passwordAfterToggle);
    });

    await test.step('Cancel and return to list', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page).toHaveURL('/security/users');
    });
  });

  test('should filter users by name', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-filter-${timestamp}`;

    await test.step('1. Create a unique test user for filtering', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('2. Verify initial user list is visible', async () => {
      const table = page.getByRole('table');
      await expect(table).toBeVisible();
    });

    const filterInput = page.getByTestId('search-field-input').getByRole('textbox');

    await test.step('3. Get filter input', async () => {
      await expect(filterInput).toBeVisible();
    });

    await test.step('4. Filter by test', async () => {
      await filterInput.fill('test');
    });

    await test.step('5. Verify URL contains query parameter q=test', async () => {
      await expect(page).toHaveURL('/security/users/?q=test');
    });

    await test.step('6. Verify filtered results show only users with test in name', async () => {
      await expect(page.getByRole('link', { name: /test-user-.*/ }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'e2euser', exact: true })).not.toBeVisible();
    });

    await test.step('7. Clear filter', async () => {
      await filterInput.fill('');
    });

    await test.step('8. Verify URL query parameter is removed', async () => {
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('9. Verify e2euser is visible again', async () => {
      await expect(page.getByRole('link', { name: 'e2euser' })).toBeVisible();
    });
  });

  test('should filter users by partial match', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-partial-${timestamp}`;

    await test.step('1. Create a unique test user for partial matching', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page).toHaveURL('/security/users');
    });

    const filterInput = page.getByTestId('search-field-input').getByRole('textbox');

    await test.step('2. Filter by e2e', async () => {
      await filterInput.fill('e2e');
    });

    await test.step('3. Verify URL contains query parameter q=e2e', async () => {
      await expect(page).toHaveURL('/security/users/?q=e2e');
    });

    await test.step('4. Verify only e2euser is visible', async () => {
      await expect(page.getByRole('link', { name: 'e2euser' })).toBeVisible();
    });

    await test.step('5. Change filter to test', async () => {
      await filterInput.fill('test');
    });

    await test.step('6. Verify URL contains query parameter q=test', async () => {
      await expect(page).toHaveURL('/security/users/?q=test');
    });

    await test.step('7. Verify test-user is visible', async () => {
      await expect(page.getByRole('link', { name: /test-user-.*/ }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'e2euser', exact: true })).not.toBeVisible();
    });

    await test.step('8. Clear filter', async () => {
      await filterInput.fill('');
    });

    await test.step('9. Verify URL query parameter is removed', async () => {
      await expect(page).toHaveURL('/security/users');
    });
  });

  test('should navigate to user detail page and back', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-nav-${timestamp}`;

    await test.step('1. Create a unique test user for navigation test', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('2. Click on the created user link', async () => {
      await page.getByRole('link', { name: username, exact: true }).click();
    });

    await test.step('3. Verify user detail page loads', async () => {
      await expect(page).toHaveURL(`/security/users/${username}/details`);
      await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible();
    });

    await test.step('4. Verify user information section', async () => {
      await expect(page.getByRole('heading', { name: 'User information' })).toBeVisible();
      await expect(page.getByText('Username')).toBeVisible();
      await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Passwords cannot be viewed')).toBeVisible();
    });

    await test.step('5. Verify sections are visible', async () => {
      await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();
      await expect(page.getByRole('heading', { name: /ACLs/ })).toBeVisible();
    });

    await test.step('6. Navigate back using breadcrumb', async () => {
      await page.getByRole('link', { name: 'Users' }).click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('7. Verify we are back on the users list', async () => {
      await expect(page.getByRole('heading', { name: 'Access Control' })).toBeVisible();
      await expect(page.getByTestId('create-user-button')).toBeVisible();
    });
  });

  test('should display user details with ACLs and roles information', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-details-${timestamp}`;

    await test.step('1. Create a unique test user for details test', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('2. Navigate to the created user detail page', async () => {
      await page.getByRole('link', { name: username, exact: true }).click();
    });

    await test.step('3. Verify URL and heading', async () => {
      await expect(page).toHaveURL(`/security/users/${username}/details`);
      await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible();
    });

    await test.step('4. Verify User information section shows correct username', async () => {
      await expect(page.getByText('test-user-123', { exact: false })).not.toBeVisible();
      await expect(page.getByText('User information')).toBeVisible();
    });

    await test.step('5. Verify Delete user button is available', async () => {
      await expect(page.getByRole('button', { name: 'Delete user' })).toBeVisible();
    });

    await test.step('6. Navigate back to list using breadcrumb', async () => {
      await page.getByRole('link', { name: 'Users' }).click();
      await expect(page).toHaveURL('/security/users');
    });
  });

  test('should validate username format requirements', async ({ page }) => {
    await test.step('1. Navigate to create user page', async () => {
      await page.getByTestId('create-user-button').click();
    });

    await test.step('2. Verify username input has help text', async () => {
      await expect(
        page.getByText('Must not contain any whitespace. Dots, hyphens and underscores may be used.')
      ).toBeVisible();
    });

    await test.step('3. Fill in valid username with allowed characters', async () => {
      const usernameInput = page.getByTestId('create-user-name');
      await usernameInput.fill('valid-user.name_123');
    });

    await test.step('4. Verify Create button becomes enabled', async () => {
      await expect(page.getByRole('button', { name: 'Create' })).toBeEnabled();
    });

    await test.step('Cancel and return', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
    });
  });

  test('should display password requirements', async ({ page }) => {
    await test.step('1. Navigate to create user page', async () => {
      await page.getByTestId('create-user-button').click();
    });

    await test.step('2. Verify password requirements are displayed', async () => {
      await expect(page.getByText('Must be at least 4 characters and should not exceed 64 characters.')).toBeVisible();
    });

    await test.step('3. Verify password field has auto-generated value', async () => {
      const passwordInput = page.getByTestId('create-user-password').locator('input').first();
      const passwordValue = await passwordInput.inputValue();
      expect(passwordValue.length).toBeGreaterThan(0);
    });

    await test.step('4. Verify refresh button is available', async () => {
      await expect(page.locator('button[aria-label="Refresh"]')).toBeVisible();
    });

    await test.step('5. Verify copy button is available', async () => {
      await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
    });

    await test.step('Cancel and return', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
    });
  });

  test('should delete a user', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-delete-${timestamp}`;

    await test.step('1. Create a unique test user for deletion', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('2. Verify user appears in the list', async () => {
      await expect(page.getByRole('link', { name: username, exact: true })).toBeVisible();
    });

    await test.step('3. Navigate to user detail page', async () => {
      await page.getByRole('link', { name: username, exact: true }).click();
      await expect(page).toHaveURL(`/security/users/${username}/details`);
      await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible();
    });

    await test.step('4. Click Delete user button', async () => {
      await page.getByRole('button', { name: 'Delete user' }).click();
    });

    await test.step('5. Confirm deletion', async () => {
      const filterInput = page.getByTestId('txt-confirmation-delete');
      await filterInput.fill(username);
      await page.getByRole('button', { name: 'Delete' }).click();
    });

    await test.step('6. Verify redirect to users list', async () => {
      await page.waitForURL('/security/users', { timeout: 10000 });
    });
  });
});
