/**
 * spec: UX-1208 — Phase 1 e2e test coverage (CRITICAL + HIGH)
 * parent epic: UX-1198 — REST-to-Connect RPC migration
 *
 * Exercises the Connect error-mapping path added when UserService.CreateUser replaced
 * REST /api/users. Without these, a regression in formatToastErrorMessageGRPC or the
 * ConnectError detail extraction would go unnoticed.
 */

import { expect, test } from '@playwright/test';

import { mockConnectError, mockConnectNetworkFailure, rpcUrl } from '../../shared/connect-mock';

const USER_SERVICE = 'redpanda.api.dataplane.v1.UserService';

test.describe('User creation - Connect RPC error handling', () => {
  test('network failure on CreateUser shows error toast and preserves form state', async ({ page }) => {
    await mockConnectNetworkFailure({ page, urlGlob: rpcUrl(USER_SERVICE, 'CreateUser') });

    const username = `net-fail-${Date.now()}`;
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-user-button')).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId('create-user-button').click();
    await expect(page).toHaveURL('/security/users/create');

    await page.getByTestId('create-user-name').fill(username);
    await page.getByTestId('create-user-submit').click();

    // Structural: remain on create form (server error must NOT navigate to detail).
    await expect(page).toHaveURL('/security/users/create');

    // Form state: username input retained after failed submit.
    await expect(page.getByTestId('create-user-name')).toHaveValue(username);

    // Success sentinel must not appear.
    await expect(page.getByTestId('user-created-successfully')).not.toBeVisible();

    // Toast copy: formatToastErrorMessageGRPC prefixes every error with "Failed to {action} {entity}".
    // The exact rawMessage from a fetch-level abort is browser-dependent ("Failed to fetch",
    // "TypeError: Failed to fetch", etc.), so we anchor on the deterministic prefix.
    await expect(page.getByText(/^Failed to create user/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('CreateUser ALREADY_EXISTS surfaces a user-friendly error', async ({ page }) => {
    await mockConnectError({
      page,
      urlGlob: rpcUrl(USER_SERVICE, 'CreateUser'),
      code: 'already_exists',
      message: 'user "existing-user" already exists',
    });

    const username = `dup-${Date.now()}`;
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-user-button')).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId('create-user-button').click();
    await page.getByTestId('create-user-name').fill(username);
    await page.getByTestId('create-user-submit').click();

    // Structural: no success, still on /create.
    await expect(page).toHaveURL('/security/users/create');
    await expect(page.getByTestId('user-created-successfully')).not.toBeVisible();

    // Toast copy: rawMessage from the mock envelope is composed verbatim into the toast title.
    await expect(page.getByText('Failed to create user: user "existing-user" already exists').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
