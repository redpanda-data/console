/** biome-ignore-all lint/performance/useTopLevelRegex: this is a test */
import { expect, type Page, test } from '@playwright/test';

export function generateSecurityName(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 5);
  return `e2e-${prefix}-${ts}-${rand}`;
}

export class SecurityPageNew {
  constructor(protected page: Page) {}

  // Retries opening a dropdown and clicking a menu item.
  // TanStack Query background refetches can re-render the table, closing open dropdowns.
  private async clickDropdownMenuItem(triggerTestId: string, itemTestId: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.page.getByTestId(triggerTestId).click();
      const item = this.page.getByTestId(itemTestId);
      try {
        await item.waitFor({ state: 'visible', timeout: 5000 });
        await item.click({ force: true });
        return;
      } catch {
        // Menu closed (re-render or animation detach) — retry
      }
    }
    throw new Error(`Could not click dropdown item ${itemTestId} after retries`);
  }

  // --- Navigation ---

  async gotoUsers() {
    await this.page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    // Wait until the filter input is interactive, confirming React has mounted
    await this.page.getByPlaceholder('Filter by name (regexp)...').waitFor({ state: 'visible' });
  }

  async gotoRoles() {
    await this.page.goto('/security/roles', { waitUntil: 'domcontentloaded' });
    // Wait until the create button is visible, confirming React has mounted
    await this.page.getByTestId('create-role-button').waitFor({ state: 'visible' });
  }

  async gotoUserDetails(name: string) {
    await this.page.goto(`/security/users/${name}/details`, { waitUntil: 'domcontentloaded' });
    // Wait for the page content to render (gated on isUsersLoading)
    await this.page.getByTestId('user-change-password-button').waitFor({ state: 'visible' });
  }

  async gotoRoleDetails(name: string) {
    await this.page.goto(`/security/roles/${encodeURIComponent(name)}/details`, {
      waitUntil: 'domcontentloaded',
    });
    // Wait for the combobox to confirm React has mounted the role detail page
    await this.page.getByTestId('add-principal-combobox').waitFor({ state: 'visible' });
  }

  // --- Users ---

  async createUser(name: string) {
    return test.step(`Create user "${name}"`, async () => {
      await this.gotoUsers();
      await this.page.getByTestId('create-user-button').click();
      await this.page.getByTestId('create-user-name').waitFor({ state: 'visible' });
      await this.page.getByLabel('Username').fill(name);
      await this.page.getByTestId('create-user-submit').click();
      // Wait for the confirmation step (the "done-button" only renders after the user is created)
      await this.page.getByTestId('done-button').waitFor({ state: 'visible' });
    });
  }

  async deleteUserFromList(name: string) {
    return test.step(`Delete user "${name}" from list`, async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await this.gotoUsers();
        await this.page.getByPlaceholder('Filter by name (regexp)...').fill(name);
        await this.page.locator(`a[href='/security/users/${name}/details']`).waitFor({ state: 'visible' });
        await this.clickDropdownMenuItem(`user-actions-button-${name}`, `user-delete-menu-item-${name}`);
        try {
          const confirmInput = this.page.getByPlaceholder(`Type "${name}" to confirm`);
          await confirmInput.waitFor({ state: 'visible', timeout: 5000 });
          await confirmInput.fill(name);
          const confirmBtn = this.page.getByTestId('test-delete-item');
          await confirmBtn.waitFor({ state: 'visible' });
          await confirmBtn.click({ force: true });
          await expect(this.page.locator(`a[href='/security/users/${name}/details']`)).not.toBeVisible({
            timeout: 10_000,
          });
          return;
        } catch {
          // Confirm dialog didn't appear; retry whole sequence
        }
      }
      throw new Error(`Failed to delete user ${name} after retries`);
    });
  }

  async deleteUserFromDetails(name: string) {
    return test.step(`Delete user "${name}" from details`, async () => {
      await this.gotoUserDetails(name);
      await this.page.getByTestId('user-delete-button').waitFor({ state: 'visible' });
      await this.page.getByTestId('user-delete-button').click();
      await this.page.getByPlaceholder(`Type "${name}" to confirm`).fill(name);
      await this.page.getByTestId('test-delete-item').click();
      await this.page.waitForURL('**/security/users**');
    });
  }

  async filterUsers(query: string) {
    await this.page.getByPlaceholder('Filter by name (regexp)...').fill(query);
    await this.page.waitForURL(/[?&]name=/);
  }

  async changePassword(newPassword: string) {
    await this.page.getByTestId('create-user-password').fill(newPassword);
    // Select a mechanism so Save is enabled
    await this.page.getByRole('combobox').click();
    await this.page.getByRole('option', { name: 'SCRAM-SHA-256' }).click();
    await this.page.getByTestId('save-password-button').click();
  }

  // --- Roles ---

  async createRole(name: string) {
    return test.step(`Create role "${name}"`, async () => {
      await this.gotoRoles();
      await this.page.getByTestId('create-role-button').click();
      await this.page.locator('#role-name').waitFor({ state: 'visible' });
      await this.page.locator('#role-name').fill(name);
      await this.page.getByTestId('create-role-submit').click();
      await this.page.waitForURL('**/security/roles/**/details');
    });
  }

  async deleteRoleFromList(name: string) {
    return test.step(`Delete role "${name}"`, async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await this.gotoRoles();
        await this.page.getByPlaceholder('Filter by name (regexp)...').fill(name);
        await this.page.getByTestId(`role-list-item-${name}`).waitFor({ state: 'visible' });
        await this.clickDropdownMenuItem(`role-actions-button-${name}`, `delete-role-button-${name}`);
        try {
          const confirmInput = this.page.getByPlaceholder(name);
          await confirmInput.waitFor({ state: 'visible', timeout: 5000 });
          await confirmInput.fill(name);
          const confirmBtn = this.page.getByTestId('confirm-role-delete-button');
          await confirmBtn.waitFor({ state: 'visible' });
          await confirmBtn.click({ force: true });
          await expect(this.page.getByTestId(`role-list-item-${name}`)).not.toBeVisible({ timeout: 10_000 });
          return;
        } catch {
          // Confirm dialog didn't appear; retry whole sequence
        }
      }
      throw new Error(`Failed to delete role ${name} after retries`);
    });
  }

  async filterRoles(query: string) {
    await this.page.getByPlaceholder('Filter by name (regexp)...').fill(query);
    await this.page.waitForURL(/[?&]name=/);
  }

  async addPrincipalToRole(principalName: string) {
    const combobox = this.page.getByTestId('add-principal-combobox');
    await combobox.click();
    await combobox.fill(principalName);
    await this.page.getByRole('option', { name: principalName }).click();
  }

  async removePrincipalFromRole(principalName: string) {
    await this.page.getByTestId(`remove-user-${principalName}-button`).click();
  }

  // --- Users: advanced ---

  async createUserWithRole(name: string, roleName: string) {
    return test.step(`Create user "${name}" with role "${roleName}"`, async () => {
      await this.gotoUsers();
      await this.page.getByTestId('create-user-button').click();
      await this.page.getByTestId('create-user-name').waitFor({ state: 'visible' });
      await this.page.getByLabel('Username').fill(name);

      // Open the role multi-select and pick the role
      await this.page.getByText('Select roles...').click();
      await this.page.getByPlaceholder('Search...').fill(roleName);
      await this.page.getByRole('option', { name: roleName }).click();
      // Close the popover by pressing Escape
      await this.page.keyboard.press('Escape');

      await this.page.getByTestId('create-user-submit').click();
      await this.page.getByTestId('done-button').waitFor({ state: 'visible' });
    });
  }

  // Clicks "Allow all operations" on the current user details page and confirms.
  async allowAllOperations() {
    return test.step('Allow all operations', async () => {
      await this.page.getByTestId('allow-all-operations-button').click();
      await this.page.getByRole('dialog', { name: 'Allow all operations' }).waitFor({ state: 'visible' });
      await this.page.getByTestId('confirm-allow-all-button').click();
      await this.page.getByRole('dialog').waitFor({ state: 'hidden' });
    });
  }

  // Assigns a role to the user from the user details page.
  async assignRoleFromDetails(roleName: string) {
    return test.step(`Assign role "${roleName}" from user details`, async () => {
      const combobox = this.page.getByTestId('assign-role-combobox');
      await combobox.click();
      await combobox.fill(roleName);
      await this.page.getByRole('option', { name: roleName }).click();
      // Wait for the role row to appear
      await this.page.getByTestId(`role-name-${roleName}`).waitFor({ state: 'visible' });
    });
  }

  // Removes a role from the user on the user details page.
  async removeRoleFromDetails(roleName: string) {
    return test.step(`Remove role "${roleName}" from user details`, async () => {
      await this.page.getByTestId(`remove-role-${roleName}`).click();
      await this.page.getByTestId('confirm-remove-role-button').waitFor({ state: 'visible' });
      await this.page.getByTestId('confirm-remove-role-button').click();
      await this.page.getByTestId(`role-name-${roleName}`).waitFor({ state: 'hidden' });
    });
  }
}
