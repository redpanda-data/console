import { step } from '../../shared/e2e';

// spec: User Management Tests (new security UI)
// seed: tests/seed.spec.ts

import { appURL, expect, type Page, test } from '../../shared/e2e';

const TEST_USER_LINK_NAME = /test-user-.*/;
const URL_NAME_QUERY_PARAM = /[?&]name=/;
const URL_NAME_TEST_QUERY_PARAM = /[?&]name=test/;
const URL_NAME_E2E_QUERY_PARAM = /[?&]name=e2e/;
const ACLS_HEADING_NAME = /ACLs/;

const userNameFilter = (page: Page) => page.getByPlaceholder('Filter by name (regexp)...');

test.describe('user Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/users', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(appURL('/security/users'));

    // Wait for API initialization to complete and button to be enabled
    // This handles timing differences between local and CI environments
    await expect(page.getByTestId('create-user-button')).toBeEnabled({ timeout: 10_000 });
  });

  test('should create a new user with special characters in password', async ({ page }) => {
    await step('1. Click Create user button to open user creation dialog', async () => {
      await page.getByTestId('create-user-button').click();
      await expect(page.getByTestId('create-user-name')).toBeVisible();
    });

    const suffix = crypto.randomUUID();
    const username = `test-user-e2e-${suffix}`;

    await step('2. Fill in username field with a unique suffix', async () => {
      await page.getByTestId('create-user-name').fill(username);
    });

    await step('3. Enable special characters checkbox', async () => {
      await page.getByTestId('special-chars-checkbox').click();
      await expect(page.getByTestId('special-chars-checkbox')).toHaveAttribute('data-state', 'checked');
    });

    await step('4. Verify Create button is enabled and submit', async () => {
      const createButton = page.getByTestId('create-user-submit');
      await expect(createButton).toBeEnabled();
      await createButton.click();
    });

    await step('5. Verify success message', async () => {
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
    });

    await step('6. Close dialog', async () => {
      await page.getByTestId('done-button').click();
      await expect(page.getByTestId('create-user-name')).not.toBeVisible();
      await expect(page).toHaveURL(appURL('/security/users'));
    });

    await step('7. Verify user appears in the list', async () => {
      await expect(page.getByRole('link', { name: username, exact: true })).toBeVisible();
    });
  });

  test('should navigate to user details after user creation via Add permissions button', async ({ page }) => {
    const suffix = crypto.randomUUID();
    const username = `test-user-acl-${suffix}`;

    await step('1. Create a new user', async () => {
      await page.getByTestId('create-user-button').click();
      await expect(page.getByTestId('create-user-name')).toBeVisible();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
    });

    await step('2. Click Add permissions button', async () => {
      await page.getByTestId('go-to-user-details-button').click();
    });

    await step('3. Verify URL is the user details page', async () => {
      await expect(page).toHaveURL(appURL(`/security/users/${username}/details`));
    });

    await step('4. Verify user details page is shown', async () => {
      await expect(page.getByText(`Principal:User:${username}`)).toBeVisible();
    });

    await step('5. Verify ACLs card is present', async () => {
      await expect(page.getByRole('heading', { name: ACLS_HEADING_NAME })).toBeVisible();
    });
  });

  test('should toggle special characters checkbox and regenerate password', async ({ page }) => {
    await step('1. Open create user dialog', async () => {
      await page.getByTestId('create-user-button').click();
      await expect(page.getByTestId('create-user-name')).toBeVisible();
    });

    const passwordInput = page.getByTestId('create-user-password');
    let initialPassword: string;
    let passwordAfterToggle: string;

    await step('2. Get initial password value', async () => {
      initialPassword = await passwordInput.inputValue();
    });

    await step('3. Toggle special characters checkbox on', async () => {
      await page.getByTestId('special-chars-checkbox').click();
      await expect(page.getByTestId('special-chars-checkbox')).toHaveAttribute('data-state', 'checked');
    });

    await step('4. Verify password changed after checkbox toggle', async () => {
      passwordAfterToggle = await passwordInput.inputValue();
      expect(passwordAfterToggle).not.toBe(initialPassword);
    });

    await step('5. Toggle checkbox off', async () => {
      await page.getByTestId('special-chars-checkbox').click();
      await expect(page.getByTestId('special-chars-checkbox')).toHaveAttribute('data-state', 'unchecked');
    });

    await step('6. Verify password changed again', async () => {
      const finalPassword = await passwordInput.inputValue();
      expect(finalPassword).not.toBe(passwordAfterToggle);
    });

    await step('Cancel and close dialog', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByTestId('create-user-name')).not.toBeVisible();
      await expect(page).toHaveURL(appURL('/security/users'));
    });
  });

  test('should filter users by name', async ({ page }) => {
    const username = `test-user-filter-${crypto.randomUUID()}`;

    await step('1. Create a unique test user for filtering', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
      await expect(page).toHaveURL(appURL('/security/users'));
    });

    await step('2. Verify initial user list is visible', async () => {
      const table = page.getByRole('table');
      await expect(table).toBeVisible();
    });

    await step('3. Filter by test', async () => {
      await userNameFilter(page).fill('test');
    });

    await step('4. Verify URL contains query parameter name=test', async () => {
      await expect(page).toHaveURL(URL_NAME_TEST_QUERY_PARAM);
    });

    await step('5. Verify filtered results show only users with test in name', async () => {
      await expect(page.getByRole('link', { name: TEST_USER_LINK_NAME }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'e2euser', exact: true })).not.toBeVisible();
    });

    await step('6. Clear filter', async () => {
      await userNameFilter(page).fill('');
    });

    await step('7. Verify URL query parameter is removed', async () => {
      await expect(page).not.toHaveURL(URL_NAME_QUERY_PARAM);
    });

    await step('8. Verify e2euser is visible again', async () => {
      await expect(page.getByRole('link', { name: 'e2euser' })).toBeVisible();
    });
  });

  test('should filter users by partial match', async ({ page }) => {
    const username = `test-user-partial-${crypto.randomUUID()}`;

    await step('1. Create a unique test user for partial matching', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
      await expect(page).toHaveURL(appURL('/security/users'));
    });

    await step('2. Filter by e2e', async () => {
      await userNameFilter(page).fill('e2e');
    });

    await step('3. Verify URL contains query parameter name=e2e', async () => {
      await expect(page).toHaveURL(URL_NAME_E2E_QUERY_PARAM);
    });

    await step('4. Verify only e2euser is visible', async () => {
      await expect(page.getByRole('link', { name: 'e2euser' })).toBeVisible();
    });

    await step('5. Change filter to test', async () => {
      await userNameFilter(page).fill('test');
    });

    await step('6. Verify URL contains query parameter name=test', async () => {
      await expect(page).toHaveURL(URL_NAME_TEST_QUERY_PARAM);
    });

    await step('7. Verify test-user is visible', async () => {
      await expect(page.getByRole('link', { name: TEST_USER_LINK_NAME }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'e2euser', exact: true })).not.toBeVisible();
    });

    await step('8. Clear filter', async () => {
      await userNameFilter(page).fill('');
    });

    await step('9. Verify URL query parameter is removed', async () => {
      await expect(page).not.toHaveURL(URL_NAME_QUERY_PARAM);
    });
  });

  test('should navigate to user detail page and back', async ({ page }) => {
    const suffix = crypto.randomUUID();
    const username = `test-user-nav-${suffix}`;

    await step('1. Create a unique test user for navigation test', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
      await expect(page).toHaveURL(appURL('/security/users'));
    });

    await step('2. Click on the created user link', async () => {
      await page.getByRole('link', { name: username, exact: true }).click();
    });

    await step('3. Verify user detail page loads', async () => {
      await expect(page).toHaveURL(appURL(`/security/users/${username}/details`));
      await expect(page.getByText(`Principal:User:${username}`)).toBeVisible();
    });

    await step('4. Verify user information section', async () => {
      // The Roles card only renders when the backend's Roles API is available (RBAC/enterprise),
      // so this OSS suite only asserts on the always-present ACLs section.
      await expect(page.getByRole('heading', { name: ACLS_HEADING_NAME })).toBeVisible();
    });

    await step('5. Navigate back using breadcrumb', async () => {
      await page.getByLabel('breadcrumb').getByRole('link', { name: 'Users' }).click();
      await expect(page).toHaveURL(appURL('/security/users'));
    });

    await step('6. Verify we are back on the users list', async () => {
      await expect(page.getByTestId('create-user-button')).toBeVisible();
    });
  });

  test('should validate username format requirements', async ({ page }) => {
    await step('1. Open create user dialog', async () => {
      await page.getByTestId('create-user-button').click();
      await expect(page.getByTestId('create-user-name')).toBeVisible();
    });

    await step('2. Verify username input has help text', async () => {
      await expect(
        page.getByText('Must not contain any whitespace. Dots, hyphens and underscores may be used.')
      ).toBeVisible();
    });

    await step('3. Fill in valid username with allowed characters', async () => {
      await page.getByTestId('create-user-name').fill('valid-user.name_123');
    });

    await step('4. Verify Create button becomes enabled', async () => {
      await expect(page.getByTestId('create-user-submit')).toBeEnabled();
    });

    await step('Cancel and return', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
    });
  });

  test('should display password requirements', async ({ page }) => {
    await step('1. Open create user dialog', async () => {
      await page.getByTestId('create-user-button').click();
      await expect(page.getByTestId('create-user-name')).toBeVisible();
    });

    await step('2. Verify password requirements are displayed', async () => {
      await expect(page.getByText('Must be at least 4 characters and should not exceed 64 characters.')).toBeVisible();
    });

    await step('3. Verify password field has auto-generated value', async () => {
      const passwordInput = page.getByTestId('create-user-password');
      const passwordValue = await passwordInput.inputValue();
      expect(passwordValue.length).toBeGreaterThan(0);
    });

    await step('4. Verify refresh button is available', async () => {
      await expect(page.getByTestId('refresh-password-button')).toBeVisible();
    });

    await step('5. Verify copy button is available', async () => {
      await expect(page.getByTestId('copy-password-button')).toBeVisible();
    });

    await step('Cancel and return', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
    });
  });

  test('should delete a user', async ({ page }) => {
    const suffix = crypto.randomUUID();
    const username = `test-user-delete-${suffix}`;

    await step('1. Create a unique test user for deletion', async () => {
      await page.getByTestId('create-user-button').click();
      await page.getByTestId('create-user-name').fill(username);
      await page.getByTestId('create-user-submit').click();
      await expect(page.getByTestId('user-created-successfully')).toBeVisible();
      await page.getByTestId('done-button').click();
      await expect(page).toHaveURL(appURL('/security/users'));
    });

    await step('2. Verify user appears in the list', async () => {
      await expect(page.getByRole('link', { name: username, exact: true })).toBeVisible();
    });

    await step('3. Navigate to user detail page', async () => {
      await page.getByRole('link', { name: username, exact: true }).click();
      await expect(page).toHaveURL(appURL(`/security/users/${username}/details`));
      await expect(page.getByText(`Principal:User:${username}`)).toBeVisible();
    });

    await step('4. Click Delete User button', async () => {
      await page.getByRole('button', { name: 'Delete User' }).click();
    });

    await step('5. Confirm deletion', async () => {
      await page.getByTestId('txt-confirmation-delete').fill(username);
      await page.getByTestId('test-delete-item').click();
    });

    await step('6. Verify redirect to users list', async () => {
      await page.waitForURL('/security/users', { timeout: 10_000 });
    });
  });
});
