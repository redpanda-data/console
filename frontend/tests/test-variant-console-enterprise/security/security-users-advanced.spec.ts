/** biome-ignore-all lint/performance/useTopLevelRegex: this is a test */
import { generateSecurityName, SecurityPageNew } from './utils/security-page-new';
import { expect, test } from '../fixtures';

test.use({ featureFlags: { enableNewSecurityPage: true } });

test.describe('Security › Users › advanced', () => {
  // ── Role assignment during user creation ─────────────────────────────────

  test('role selected at creation appears in user details', async ({ page }) => {
    const roleName = generateSecurityName('role');
    const userName = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.createRole(roleName);
    await sp.createUserWithRole(userName, roleName);

    await test.step('verify role shown in user details Roles card', async () => {
      await sp.gotoUserDetails(userName);
      await expect(page.getByTestId(`role-name-${roleName}`)).toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteUserFromDetails(userName);
    await sp.deleteRoleFromList(roleName);
  });

  // ── Allow all operations ──────────────────────────────────────────────────

  test('Allow all operations creates ACLs for all resource types', async ({ page }) => {
    const userName = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.createUser(userName);
    await sp.gotoUserDetails(userName);

    await sp.allowAllOperations();

    await test.step('verify ACL rows appear for all resources', async () => {
      // Wait for at least 4 Allow permission cells (Topic/Group/Cluster/TransactionalId,
      // plus Subject/SchemaRegistry when schemaRegistryACLApi is enabled)
      const allowCells = page.getByRole('cell', { name: 'Allow' });
      await expect(allowCells.first()).toBeVisible({ timeout: 10_000 });
      await expect(allowCells.nth(3)).toBeVisible();
      // Each row should show "All" operation
      await expect(page.getByRole('cell', { name: 'All' }).first()).toBeVisible();
    });

    await sp.deleteUserFromDetails(userName);
  });

  // ── Assign / remove role from user details page ───────────────────────────

  test('assign role from user details', async ({ page }) => {
    const roleName = generateSecurityName('role');
    const userName = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.createRole(roleName);
    await sp.createUser(userName);
    await sp.gotoUserDetails(userName);

    await sp.assignRoleFromDetails(roleName);

    await test.step('verify role row visible', async () => {
      await expect(page.getByTestId(`role-name-${roleName}`)).toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteUserFromDetails(userName);
    await sp.deleteRoleFromList(roleName);
  });

  test('remove role from user details', async ({ page }) => {
    const roleName = generateSecurityName('role');
    const userName = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.createRole(roleName);
    await sp.createUser(userName);
    await sp.gotoUserDetails(userName);
    await sp.assignRoleFromDetails(roleName);

    await sp.removeRoleFromDetails(roleName);

    await test.step('verify role row gone', async () => {
      await expect(page.getByTestId(`role-name-${roleName}`)).not.toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteUserFromDetails(userName);
    await sp.deleteRoleFromList(roleName);
  });

  // ── Role membership visible in Permissions page ───────────────────────────

  test('user with role shows role-based ACLs in Permissions page', async ({ page }) => {
    const roleName = generateSecurityName('role');
    const userName = generateSecurityName('usr');
    const topicName = generateSecurityName('topic');
    const sp = new SecurityPageNew(page);

    await sp.createRole(roleName);

    // Add an ACL to the role so it has something to show
    await sp.gotoRoleDetails(roleName);
    await test.step('add ACL to role', async () => {
      await page.getByTestId('add-acl-button').click();
      await page.getByRole('dialog', { name: 'Add ACL' }).waitFor({ state: 'visible' });
      await page.getByPlaceholder('e.g. my-topic').fill(topicName);
      await page.getByTestId('add-acl-submit-button').click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
    });

    // Create user and assign the role
    await sp.createUser(userName);
    await sp.gotoUserDetails(userName);
    await sp.assignRoleFromDetails(roleName);

    await test.step('permissions page shows user row', async () => {
      await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
      await page.getByTestId(`row-${userName}`).waitFor({ state: 'visible', timeout: 15_000 });
      await expect(page.getByTestId(`row-${userName}`)).toBeVisible();
    });

    await sp.deleteUserFromDetails(userName);
    await sp.deleteRoleFromList(roleName);
  });

  // ── SASL mechanism is preserved in confirmation step ─────────────────────

  test('SCRAM-SHA-512 mechanism set during creation shows in user list', async ({ page }) => {
    const userName = generateSecurityName('usr');
    const sp = new SecurityPageNew(page);

    await sp.gotoUsers();
    await page.getByTestId('create-user-button').click();
    await page.getByTestId('create-user-name').waitFor({ state: 'visible' });
    await page.getByLabel('Username').fill(userName);

    // Switch from default SCRAM-SHA-256 to SCRAM-SHA-512
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'SCRAM-SHA-512' }).click();

    await page.getByTestId('create-user-submit').click();
    await page.getByTestId('done-button').waitFor({ state: 'visible' });

    await test.step('mechanism label shown in user list', async () => {
      await sp.gotoUsers();
      await sp.filterUsers(userName);
      await expect(page.getByText('SCRAM-SHA-512')).toBeVisible({ timeout: 10_000 });
    });

    await sp.deleteUserFromList(userName);
  });
});
