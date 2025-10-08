import { expect, type Page } from '@playwright/test';
import { ACLPage } from './ACLPage';

/**
 * Page Object Model for Role pages
 * Extends ACLPage and overrides navigation and role-specific methods
 */
export class RolePage extends ACLPage {
  constructor(page: Page) {
    super(page);
  }

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

  async validateListItem(host: string, principal: string) {
    await this.gotoList();

    // Validate that the ACL list item is visible with correct host and principal
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

      // Wait for the add operation to complete and UI to update
      await this.page.waitForTimeout(500);

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
    const countElement = this.page.locator('text=/Matching users \\/ principals \\(' + expectedCount + '\\)/');
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

      // Wait for deletion to complete
      await this.page.waitForTimeout(500);

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
}
