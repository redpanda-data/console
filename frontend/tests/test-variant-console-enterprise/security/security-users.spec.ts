import { generateSecurityName, SecurityPageNew } from './utils/security-page-new';
import { expect, test } from '../fixtures';

test.use({ featureFlags: { enableNewSecurityPage: true } });

test.describe('Security › Users', () => {
  test('create user appears in list', async ({ page }) => {
    const name = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.createUser(name);

    await test.step('verify user link in list', async () => {
      await sp.gotoUsers();
      await expect(page.locator(`a[href='/security/users/${name}/details']`)).toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteUserFromList(name);
  });

  test('filter users by name regexp', async ({ page }) => {
    const sp = new SecurityPageNew(page);
    const suffix = Math.random().toString(36).substring(2, 6);
    const name1 = `e2e-usr-filter-${suffix}-a`;
    const name2 = `e2e-usr-filter-${suffix}-b`;
    const name3 = `e2e-usr-filter-${suffix}-c`;

    await sp.createUser(name1);
    await sp.createUser(name2);
    await sp.createUser(name3);

    await sp.gotoUsers();
    await sp.filterUsers(`e2e-usr-filter-${suffix}-[ab]`);

    await expect(page.locator(`a[href='/security/users/${name1}/details']`)).toBeVisible();
    await expect(page.locator(`a[href='/security/users/${name2}/details']`)).toBeVisible();
    await expect(page.locator(`a[href='/security/users/${name3}/details']`)).not.toBeVisible();

    await sp.deleteUserFromDetails(name1);
    await sp.deleteUserFromDetails(name2);
    await sp.deleteUserFromDetails(name3);
  });

  test('navigate to user details', async ({ page }) => {
    const name = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.createUser(name);

    await test.step('navigate via list link', async () => {
      await sp.gotoUsers();
      await sp.filterUsers(name);
      await page.locator(`a[href='/security/users/${name}/details']`).click();
      await page.waitForURL(`**/security/users/${name}/details`);
      // Verify the change-password button is present (confirms user details page loaded)
      await expect(page.getByTestId('user-change-password-button')).toBeVisible({ timeout: 15_000 });
    });

    await sp.deleteUserFromList(name);
  });

  test('change user password', async ({ page }) => {
    const name = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.createUser(name);
    await sp.gotoUserDetails(name);

    await test.step('open change-password dialog and save', async () => {
      await page.getByTestId('user-change-password-button').click();
      await sp.changePassword('NewP@ssw0rd-e2e-x');
      // Dialog closes on success; the button should be visible again
      await expect(page.getByTestId('user-change-password-button')).toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteUserFromDetails(name);
  });

  test('add ACL to user from details page', async ({ page }) => {
    const name = generateSecurityName('usr');
    const topicName = generateSecurityName('topic');
    const sp = new SecurityPageNew(page);

    await sp.createUser(name);
    await sp.gotoUserDetails(name);

    await test.step('add ACL via dialog', async () => {
      await page.getByTestId('add-acl-button').click();
      await page.getByRole('dialog', { name: 'Add ACL' }).waitFor({ state: 'visible' });
      // Resource Name input (pattern = Literal by default)
      await page.getByPlaceholder('e.g. my-topic').fill(topicName);
      await page.getByTestId('add-acl-submit-button').click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
    });

    await test.step('verify ACL row in card', async () => {
      await expect(page.getByText(topicName)).toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteUserFromDetails(name);
  });

  test('delete user from list', async ({ page }) => {
    const name = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.createUser(name);
    await sp.deleteUserFromList(name);

    await expect(page.locator(`a[href='/security/users/${name}/details']`)).not.toBeVisible();
  });
});
