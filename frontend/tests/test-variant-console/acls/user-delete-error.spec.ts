/**
 * spec: UX-1208 — Phase 1 e2e test coverage (CRITICAL + HIGH)
 * parent epic: UX-1198 — REST-to-Connect RPC migration
 *
 * Exercises the error path in UserService.DeleteUser. The REST endpoint had a slightly
 * different error envelope; this guards the migrated toast + UI state.
 */

import { mockConnectError, rpcUrl } from '../../shared/connect-mock';
import { appURL, expect, type Page, test } from '../../shared/e2e';
import { SecurityPage } from '../utils/security-page';

const USER_SERVICE = 'redpanda.api.dataplane.v1.UserService';

const seedUserAndOpenList = async (securityPage: SecurityPage, page: Page, username: string) => {
  await securityPage.createUser(username);
  await page.goto('/security/users');
  await expect(page).toHaveURL(appURL('/security/users'));
};

/** Opens the user's details from the list and confirms its deletion. */
const deleteUserFromDetails = async (page: Page, username: string) => {
  await page.getByRole('link', { name: username, exact: true }).click();
  await expect(page).toHaveURL(appURL(`/security/users/${username}/details`));

  await page.getByRole('button', { name: 'Delete user' }).click();
  await page.getByTestId('txt-confirmation-delete').fill(username);
  await page.getByRole('button', { name: 'Delete' }).click();
};

test.describe('user deletion - error paths', () => {
  test('deleteUser FAILED_PRECONDITION keeps the user and shows error toast', async ({ page }) => {
    const securityPage = new SecurityPage(page);
    const username = `test-delete-error-${crypto.randomUUID()}`;

    // Seed a real user via happy path so there's a row to attempt deleting.
    await seedUserAndOpenList(securityPage, page, username);

    // Now intercept DeleteUser so the attempt fails deterministically.
    await mockConnectError({
      page,
      urlGlob: rpcUrl(USER_SERVICE, 'DeleteUser'),
      code: 'failed_precondition',
      message: 'user has dependent ACLs',
    });

    await deleteUserFromDetails(page, username);

    // Structural: must not navigate to list on failed delete.
    await expect(page).toHaveURL(appURL(`/security/users/${username}/details`));

    // Toast copy: formatToastErrorMessageGRPC composes "Failed to delete user: <rawMessage>".
    // Asserted before the list-reload below — sonner toasts do not survive page navigation.
    await expect(page.getByText('Failed to delete user: user has dependent ACLs').first()).toBeVisible({
      timeout: 10_000,
    });

    // Reload list and confirm the user still appears — deletion truly didn't happen client-side.
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: username, exact: true })).toBeVisible({ timeout: 5000 });
  });
});
