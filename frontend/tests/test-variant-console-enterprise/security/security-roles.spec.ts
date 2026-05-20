import { generateSecurityName, SecurityPageNew } from './utils/security-page-new';
import { expect, test } from '../fixtures';

test.use({ featureFlags: { enableNewSecurityPage: true } });

test.describe('Security › Roles', () => {
  test('create role appears in list', async ({ page }) => {
    const name = generateSecurityName('role');
    const sp = new SecurityPageNew(page);

    await sp.createRole(name);

    await test.step('verify role in list', async () => {
      await sp.gotoRoles();
      await sp.filterRoles(name);
      await expect(page.getByTestId(`role-list-item-${name}`)).toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteRoleFromList(name);
  });

  test('filter roles by name regexp', async ({ page }) => {
    const sp = new SecurityPageNew(page);
    const suffix = Math.random().toString(36).substring(2, 6);
    const nameA = `e2e-role-filter-${suffix}-a`;
    const nameB = `e2e-role-filter-${suffix}-b`;
    const nameC = `e2e-role-filter-${suffix}-c`;

    await sp.createRole(nameA);
    await sp.createRole(nameB);
    await sp.createRole(nameC);

    await sp.gotoRoles();
    await sp.filterRoles(`e2e-role-filter-${suffix}-[ab]`);

    await expect(page.getByTestId(`role-list-item-${nameA}`)).toBeVisible();
    await expect(page.getByTestId(`role-list-item-${nameB}`)).toBeVisible();
    await expect(page.getByTestId(`role-list-item-${nameC}`)).not.toBeVisible();

    await sp.deleteRoleFromList(nameA);
    await sp.deleteRoleFromList(nameB);
    await sp.deleteRoleFromList(nameC);
  });

  test('navigate to role details', async ({ page }) => {
    const name = generateSecurityName('role');
    const sp = new SecurityPageNew(page);

    await sp.createRole(name);

    await test.step('navigate via list link', async () => {
      await sp.gotoRoles();
      await sp.filterRoles(name);
      await page.getByTestId(`role-list-item-${name}`).click();
      await page.waitForURL('**/security/roles/**/details');
      await expect(page.getByRole('heading', { name })).toBeVisible();
    });

    await sp.deleteRoleFromList(name);
  });

  test('add principal to role', async ({ page }) => {
    const name = generateSecurityName('role');
    const sp = new SecurityPageNew(page);

    await sp.createRole(name);
    await sp.gotoRoleDetails(name);

    await test.step('add e2euser as principal', async () => {
      await sp.addPrincipalToRole('e2euser');
      await expect(page.getByTestId('remove-user-e2euser-button')).toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteRoleFromList(name);
  });

  test('remove principal from role', async ({ page }) => {
    const name = generateSecurityName('role');
    const sp = new SecurityPageNew(page);

    await sp.createRole(name);
    await sp.gotoRoleDetails(name);

    await sp.addPrincipalToRole('e2euser');
    await expect(page.getByTestId('remove-user-e2euser-button')).toBeVisible();

    await test.step('remove e2euser from role', async () => {
      await sp.removePrincipalFromRole('e2euser');
      await expect(page.getByTestId('remove-user-e2euser-button')).not.toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteRoleFromList(name);
  });

  test('delete role from list', async ({ page }) => {
    const name = generateSecurityName('role');
    const sp = new SecurityPageNew(page);

    await sp.createRole(name);
    await sp.deleteRoleFromList(name);

    await sp.gotoRoles();
    await sp.filterRoles(name);
    await expect(page.getByTestId(`role-list-item-${name}`)).not.toBeVisible();
  });
});
