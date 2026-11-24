import { mockConnectError, rpcUrl } from '../../shared/connect-mock';
import { appURL, expect, type Page, test } from '../../shared/e2e';
import { SecurityPage } from '../utils/security-page';

const USER_SERVICE = 'redpanda.api.dataplane.v1.UserService';

const seedUserAndOpenList = async (securityPage: SecurityPage, page: Page, username: string) => {
  await securityPage.createUser(username);
  await page.goto('/security/users');
  await expect(page).toHaveURL(appURL('/security/users'));
};

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

    await seedUserAndOpenList(securityPage, page, username);

    await mockConnectError({
      page,
      urlGlob: rpcUrl(USER_SERVICE, 'DeleteUser'),
      code: 'failed_precondition',
      message: 'user has dependent ACLs',
    });

    await deleteUserFromDetails(page, username);

    await expect(page).toHaveURL(appURL(`/security/users/${username}/details`));

    await expect(page.getByText('Failed to delete user: user has dependent ACLs').first()).toBeVisible({
      timeout: 10_000,
    });

    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: username, exact: true })).toBeVisible({ timeout: 5000 });
  });
});
