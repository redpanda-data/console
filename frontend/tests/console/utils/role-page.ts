import { expect, test } from '@playwright/test';

import { AclPage } from './acl-page';

/**
 * Page Object Model for Role pages
 * Extends AclPage and overrides navigation and role-specific methods
 */
export class RolePage extends AclPage {
  /**
   * Override navigation methods for Role context
   */
  async goto() {
    await this.page.goto('/security/roles/create');
  }

  async gotoDetail(roleName: string) {
    await this.page.goto(`/security/roles/${roleName}/details`);
  }

  async gotoUpdate(roleName: string) {
    await this.page.goto(`/security/roles/${roleName}/update`);
  }

  async gotoList() {
    await this.page.goto('/security/roles');
  }

  async validateListItem(_host: string, principal: string) {
    await this.gotoList();

    // Validate that the _hostlist item is visible with correct host and principal
    await this.page.getByTestId('search-field-input').fill(principal);
    const listItem = this.page.getByTestId(`role-list-item-${principal}`);
    await expect(listItem).toBeVisible({ timeout: 1000 });
  }

  async waitForDetailPage() {
    await this.page.waitForURL(/\/security\/roles\/.*\/details/);
  }

  async waitForUpdatePage() {
    await this.page.waitForURL(/\/security\/roles\/.*\/update/);
  }

  // Override setPrincipal to select RedpandaRole type and set the role name
  async setPrincipal(roleName: string) {
    // Now set the role name in the principal input
    await this.page.getByTestId('shared-principal-input').fill(roleName);
  }

  /**
   * Add membership to the role from the detail page
   * @param usernames Array of usernames to add as members to the role
   */
  async addMembership(usernames: string[]) {
    // Click the "Add user/principal" button
    const addButton = this.page.getByTestId('add-user-principal-button');

    for (const username of usernames) {
      // Click the add button to show the input
      await addButton.click();

      // Enter the username
      const userInput = this.page.getByTestId('add-user-input');
      await userInput.waitFor({ state: 'visible' });
      await userInput.fill(username);

      // Click the confirm button to add the user
      const confirmButton = this.page.getByTestId('confirm-add-user-button');
      await confirmButton.click();

      // Verify the user was added by checking if it appears in the list
      await this.validateMemberExists(username);
    }
  }

  /**
   * Validate that a specific member exists in the role
   * @param username The username to check for
   */
  async validateMemberExists(username: string) {
    // The member should appear in the matching users card
    const memberElement = this.page.locator('.text-left').filter({ hasText: username });
    await memberElement.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Validate the total count of members in the role
   * @param expectedCount The expected number of members
   */
  async validateMemberCount(expectedCount: number) {
    // The count is shown in the card header
    const countElement = this.page.locator(`text=/Matching users \\/ principals \\(${expectedCount}\\)/`);
    await countElement.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Delete membership from the role
   * @param usernames Array of usernames to remove from the role
   */
  async deleteMembership(usernames: string[]) {
    for (const username of usernames) {
      // Find the member element and its delete button
      const deleteButton = this.page.getByTestId(`remove-user-${username}-button`);

      // Click the delete button
      await deleteButton.click();

      // Verify the user was removed
      await this.validateMemberNotExists(username);
    }
  }

  /**
   * Validate that a specific member does not exist in the role
   * @param username The username to check for absence
   */
  async validateMemberNotExists(username: string) {
    // The member should not appear in the matching users card
    const memberElement = this.page.locator('.text-left').filter({ hasText: username });
    await memberElement.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * High-level convenience methods
   * These combine multiple operations for common workflows
   */

  /**
   * Creates a role with the given name through the UI
   * Uses allow-all-operations for simplicity
   */
  async createRole(roleName: string) {
    return await test.step('Create role', async () => {
      await this.gotoList();
      await this.page.getByTestId('create-role-button').click();

      await this.page.waitForURL('/security/roles/create', {
        waitUntil: 'domcontentloaded',
      });
      await this.page.getByLabel('Role name').fill(roleName);
      await this.page.getByTestId('roles-allow-all-operations').click();
      await this.page.getByRole('button').getByText('Create').click();
      await this.page.waitForURL(`/security/roles/${roleName}/details`);
    });
  }

  /**
   * Deletes a role with the given name through the UI
   */
  async deleteRole(roleName: string) {
    return await test.step('Delete role', async () => {
      await this.gotoDetail(roleName);
      await this.page.getByRole('button').getByText('Delete').click();
      await this.page.getByPlaceholder(`Type "${roleName}" to confirm`).fill(roleName);
      await this.page.getByTestId('test-delete-item').click();
      await this.page.waitForURL(`/security/roles/${roleName}/details`, {
        waitUntil: 'domcontentloaded',
      });
    });
  }
}
