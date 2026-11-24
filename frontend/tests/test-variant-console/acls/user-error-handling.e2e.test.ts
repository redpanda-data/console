import { mockConnectError, mockConnectNetworkFailure, rpcUrl } from '../../shared/connect-mock';
import { appURL, expect, test } from '../../shared/e2e';

const USER_SERVICE = 'redpanda.api.dataplane.v1.UserService';
const CREATE_USER_FAILURE_TOAST_PREFIX = /^Failed to create user/u;

test.describe('user creation - Connect RPC error handling', () => {
  test('network failure on CreateUser shows error toast and preserves form state', async ({ page }) => {
    await mockConnectNetworkFailure({ page, urlGlob: rpcUrl(USER_SERVICE, 'CreateUser') });

    const username = `net-fail-${crypto.randomUUID()}`;
    await page.goto('/security/users/create', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-user-name')).toBeVisible();

    await page.getByTestId('create-user-name').fill(username);
    await page.getByTestId('create-user-submit').click();

    await expect(page).toHaveURL(appURL('/security/users/create'));

    await expect(page.getByTestId('create-user-name')).toHaveValue(username);

    await expect(page.getByTestId('user-created-successfully')).not.toBeVisible();

    await expect(page.getByText(CREATE_USER_FAILURE_TOAST_PREFIX).first()).toBeVisible({ timeout: 10_000 });
  });

  test('createUser ALREADY_EXISTS surfaces a user-friendly error', async ({ page }) => {
    await mockConnectError({
      page,
      urlGlob: rpcUrl(USER_SERVICE, 'CreateUser'),
      code: 'already_exists',
      message: 'user "existing-user" already exists',
    });

    const username = `dup-${crypto.randomUUID()}`;
    await page.goto('/security/users/create', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-user-name')).toBeVisible();

    await page.getByTestId('create-user-name').fill(username);
    await page.getByTestId('create-user-submit').click();

    await expect(page).toHaveURL(appURL('/security/users/create'));
    await expect(page.getByTestId('user-created-successfully')).not.toBeVisible();

    await expect(page.getByText('Failed to create user: user "existing-user" already exists').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('create-user-button on the Users tab opens the create-user dialog in place', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-user-button')).toBeEnabled({ timeout: 10_000 });

    await page.getByTestId('create-user-button').click();

    await expect(page.getByTestId('create-user-name')).toBeVisible();
    await expect(page).toHaveURL(appURL('/security/users'));
  });
});
