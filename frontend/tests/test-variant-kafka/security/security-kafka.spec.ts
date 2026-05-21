/** biome-ignore-all lint/performance/useTopLevelRegex: this is a test */
import { expect, test } from '../fixtures';

// ── Old security layout (no feature flag: Kafka default) ──────────────────────

test.describe('Security (Kafka) › old layout', () => {
  test('navigates to ACLs page by default', async ({ page }) => {
    await page.goto('/security', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/security/acls**');
  });

  test('Roles tab is disabled', async ({ page }) => {
    await page.goto('/security/acls', { waitUntil: 'domcontentloaded' });
    const rolesTab = page.getByRole('tab', { name: 'Roles' });
    await rolesTab.waitFor({ state: 'visible' });
    await expect(rolesTab).toBeDisabled();
  });

  test('Users tab is disabled', async ({ page }) => {
    await page.goto('/security/acls', { waitUntil: 'domcontentloaded' });
    const usersTab = page.getByRole('tab', { name: 'Users' });
    await usersTab.waitFor({ state: 'visible' });
    await expect(usersTab).toBeDisabled();
  });

  test('ACLs tab is enabled', async ({ page }) => {
    await page.goto('/security/acls', { waitUntil: 'domcontentloaded' });
    const aclsTab = page.getByRole('tab', { name: 'ACLs' });
    await aclsTab.waitFor({ state: 'visible' });
    await expect(aclsTab).not.toBeDisabled();
  });

  test('clicking disabled Roles tab does not navigate', async ({ page }) => {
    await page.goto('/security/acls', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Roles' }).waitFor({ state: 'visible' });
    await page.getByRole('tab', { name: 'Roles' }).click({ force: true });
    await expect(page).toHaveURL(/\/security\/acls/);
  });
});

// ── New security layout (enableNewSecurityPage: true) ─────────────────────────

test.describe('Security (Kafka) › new layout', () => {
  test.use({ featureFlags: { enableNewSecurityPage: true } });

  test('navigates to users page by default', async ({ page }) => {
    await page.goto('/security', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/security/users**');
  });

  test('Roles tab is disabled with tooltip', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    const rolesTab = page.getByRole('tab', { name: 'Roles' });
    await rolesTab.waitFor({ state: 'visible' });
    await expect(rolesTab).toBeDisabled();

    // Tooltip shows why Roles are unavailable
    await rolesTab.hover();
    await expect(page.getByText('Roles are not supported by your cluster.')).toBeVisible({ timeout: 5000 });
  });

  test('clicking disabled Roles tab does not navigate', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Roles' }).waitFor({ state: 'visible' });
    await page.getByRole('tab', { name: 'Roles' }).click({ force: true });
    // Still on users page
    await expect(page).toHaveURL(/\/security\/users/);
  });

  test('Users tab is disabled — no SCRAM user management in Kafka', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    const usersTab = page.getByRole('tab', { name: 'Users' });
    await usersTab.waitFor({ state: 'visible' });
    await expect(usersTab).toBeDisabled();
  });

  test('no Create user button on users page', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('create-user-button')).not.toBeVisible();
  });

  test('Roles tab is disabled on Permissions page', async ({ page }) => {
    await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
    const rolesTab = page.getByRole('tab', { name: 'Roles' });
    await rolesTab.waitFor({ state: 'visible' });
    await expect(rolesTab).toBeDisabled();
  });

  test('Create ACL button is available on Permissions page', async ({ page }) => {
    await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
    const createBtn = page.getByRole('button', { name: 'Create ACL' });
    await createBtn.waitFor({ state: 'visible' });
    await expect(createBtn).not.toBeDisabled();
  });

  test('can open Add ACL dialog and set a user principal', async ({ page }) => {
    await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create ACL' }).click();

    // Dialog opens
    await page.getByRole('dialog', { name: 'Add ACL' }).waitFor({ state: 'visible' });

    // User principal input is shown (creatable combobox)
    const principalInput = page.getByPlaceholder('Select or type a user...');
    await principalInput.waitFor({ state: 'visible' });
    await principalInput.click();
    await principalInput.fill('e2e-kafka-principal');
    // Confirm option appears (creatable)
    await page.getByText('Create "e2e-kafka-principal"').waitFor({ state: 'visible' });

    // Close without submitting
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  });
});
