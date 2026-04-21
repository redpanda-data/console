// spec: ACL User Management Tests
// seed: tests/seed.spec.ts

import { expect, test } from '@playwright/test';

test.describe('ACL User Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Security/Users page
    await page.goto('/security/users', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL('/security/users');

    // Wait for API initialization to complete and button to be enabled
    // This handles timing differences between local and CI environments
    await expect(page.getByTestId('create-user-button')).toBeEnabled({ timeout: 10_000 });
  });

  test('should create a new user with special characters in password', async ({ page }) => {
    await test.step('1. Click Create user button to open user creation dialog', async () => {
      await page.getByTestId('create-user-button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
    });

    const timestamp = Date.now();
    const username = `test-user-e2e-${timestamp}`;

    await test.step('2. Fill in username field with timestamp suffix for unique test runs', async () => {
      await page.getByTestId('create-user-name').fill(username);
    });

    await test.step('3. Enable special characters checkbox', async () => {
      await page.getByTestId('special-chars-checkbox').click();
      await expect(page.getByTestId('special-chars-checkbox')).toHaveAttribute('data-state', 'checked');
    });

    await test.step('4. Verify Create button is enabled and submit', async () => {
      const createButton = page.getByTestId('create-user-submit');
      await expect(createButton).toBeEnabled();
      await createButton.click();
    });

    await test.step('5. Verify success message', async () => {
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await expect(page.getByRole('dialog').getByText(username)).toBeVisible();
    });

    await test.step('6. Return to users list', async () => {
      await page.getByTestId('done-button').click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('7. Verify user appears in the list', async () => {
      await expect(page.getByRole('link', { name: username })).toBeVisible();
    });
  });

  test('should navigate to Create ACLs with pre-populated principal after user creation', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-acl-${timestamp}`;

    await test.step('1. Create a new user', async () => {
      await page.getByTestId('create-user-button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
    });

    await test.step('2. Click Create ACLs button', async () => {
      await page.getByTestId('create-acls-button').click();
    });

    await test.step('3. Verify URL contains principalType and principalName params', async () => {
      await expect(page).toHaveURL(/\/security\/acls\/create/);
      const url = new URL(page.url());
      expect(url.searchParams.get('principalType')).toBe('User');
      expect(url.searchParams.get('principalName')).toBe(username);
    });

    await test.step('4. Verify principal input is pre-populated with username', async () => {
      const principalInput = page.getByTestId('shared-principal-input');
      await expect(principalInput).toBeVisible();
      await expect(principalInput).toHaveValue(username);
    });

    await test.step('5. Verify principal type is User', async () => {
      const typeSelect = page.getByTestId('shared-principal-type-select');
      await expect(typeSelect).toHaveText('User');
    });
  });

  test('should toggle special characters checkbox and regenerate password', async ({ page }) => {
    await test.step('1. Navigate to create user page', async () => {
      await page.getByTestId('create-user-button').click();
    });

    const passwordInput = page.getByTestId('create-user-password');
    let initialPassword: string;
    let passwordAfterToggle: string;

    await test.step('2. Get initial password value', async () => {
      initialPassword = await passwordInput.inputValue();
    });

    await test.step('3. Toggle special characters checkbox on', async () => {
      await page.getByTestId('special-chars-checkbox').click();
      await expect(page.getByTestId('special-chars-checkbox')).toHaveAttribute('data-state', 'checked');
    });

    await test.step('4. Verify password changed after checkbox toggle', async () => {
      passwordAfterToggle = await passwordInput.inputValue();
      expect(passwordAfterToggle).not.toBe(initialPassword);
    });

    await test.step('5. Toggle checkbox off', async () => {
      await page.getByTestId('special-chars-checkbox').click();
      await expect(page.getByTestId('special-chars-checkbox')).toHaveAttribute('data-state', 'unchecked');
    });

    await test.step('6. Verify password changed again', async () => {
      const finalPassword = await passwordInput.inputValue();
      expect(finalPassword).not.toBe(passwordAfterToggle);
    });

    await test.step('Cancel and return to list', async () => {
      await page.getByTestId('create-user-cancel').click();
      await expect(page).toHaveURL('/security/users');
    });
  });

  test('should filter users by name', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-filter-${timestamp}`;

    await test.step('1. Create a unique test user for filtering', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
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
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
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
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('2. Click on the created user link', async () => {
      await page.getByRole('link', { name: username, exact: true }).click();
    });

    await test.step('3. Verify user detail page loads', async () => {
      await expect(page).toHaveURL(`/security/users/${username}`);
      await expect(page.getByRole('heading', { name: username, exact: true }).first()).toBeVisible();
    });

    await test.step('4. Verify user information section', async () => {
      await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
    });

    await test.step('5. Verify sections are visible', async () => {
      await expect(page.getByText('Roles').first()).toBeVisible();
      await expect(page.getByText('ACLs').first()).toBeVisible();
    });

    await test.step('6. Navigate back using breadcrumb', async () => {
      await page.getByRole('link', { name: 'Users' }).first().click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('7. Verify we are back on the users list', async () => {
      await expect(page.getByTestId('create-user-button')).toBeVisible();
    });
  });

  test('should display user details with ACLs and roles information', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-details-${timestamp}`;

    await test.step('1. Create a unique test user for details test', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('2. Navigate to the created user detail page', async () => {
      await page.getByRole('link', { name: username, exact: true }).click();
    });

    await test.step('3. Verify URL and heading', async () => {
      await expect(page).toHaveURL(`/security/users/${username}`);
      await expect(page.getByRole('heading', { name: username, exact: true }).first()).toBeVisible();
    });

    await test.step('4. Verify correct username is shown', async () => {
      await expect(page.getByText('test-user-123', { exact: false })).not.toBeVisible();
      await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
    });

    await test.step('5. Verify Delete User button is available', async () => {
      await expect(page.getByRole('button', { name: 'Delete User' })).toBeVisible();
    });

    await test.step('6. Navigate back to list using breadcrumb', async () => {
      await page.getByRole('link', { name: 'Users' }).first().click();
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
      await page.getByTestId('create-user-name').fill('valid-user.name_123');
    });

    await test.step('4. Verify Create button becomes enabled', async () => {
      await expect(page.getByTestId('create-user-submit')).toBeEnabled();
    });

    await test.step('Cancel and return', async () => {
      await page.getByTestId('create-user-cancel').click();
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
      const passwordInput = page.getByTestId('create-user-password');
      const passwordValue = await passwordInput.inputValue();
      expect(passwordValue.length).toBeGreaterThan(0);
    });

    await test.step('4. Verify refresh button is available', async () => {
      await expect(page.getByTestId('refresh-password-button')).toBeVisible();
    });

    await test.step('5. Verify copy button is available', async () => {
      await expect(page.getByTestId('copy-password-button')).toBeVisible();
    });

    await test.step('Cancel and return', async () => {
      await page.getByTestId('create-user-cancel').click();
    });
  });

  test('should delete a user', async ({ page }) => {
    const timestamp = Date.now();
    const username = `test-user-delete-${timestamp}`;

    await test.step('1. Create a unique test user for deletion', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
      await expect(page).toHaveURL('/security/users');
    });

    await test.step('2. Verify user appears in the list', async () => {
      await expect(page.getByRole('link', { name: username, exact: true })).toBeVisible();
    });

    await test.step('3. Navigate to user detail page', async () => {
      await page.getByRole('link', { name: username, exact: true }).click();
      await expect(page).toHaveURL(`/security/users/${username}`);
      await expect(page.getByRole('heading', { name: username, exact: true }).first()).toBeVisible();
    });

    await test.step('4. Click Delete User button', async () => {
      await page.getByRole('button', { name: 'Delete User' }).click();
    });

    await test.step('5. Confirm deletion', async () => {
      await page.getByRole('button', { name: 'Delete User' }).last().click();
    });

    await test.step('6. Verify redirect to users list', async () => {
      await page.waitForURL('/security/users', { timeout: 10_000 });
    });
  });
});
