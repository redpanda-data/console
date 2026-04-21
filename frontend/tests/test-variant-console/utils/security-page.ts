/** biome-ignore-all lint/performance/useTopLevelRegex: this is a test */
import { type Page, test } from '@playwright/test';

/**
 * Page Object Model for Security pages
 * Handles user management and other security-related operations
 */
export class SecurityPage {
  constructor(protected page: Page) {}

  /**
   * Navigation methods
   */
  async goToUsersList() {
    await this.page.goto('/security/users');
  }

  async goToUserDetails(username: string) {
    await this.page.goto(`/security/users/${username}`);
  }

  async goToCreateUser() {
    await this.page.goto('/security/users/create');
  }

  /**
   * User list operations
   */
  async clickCreateUserButton() {
    await this.page.getByTestId('create-user-button').click();
  }

  /**
   * User creation operations
   */
  async fillUsername(username: string) {
    await this.page.getByLabel('Username').fill(username);
  }

  async submitUserCreation() {
    await this.page.getByTestId('create-user-submit').click();
  }

  /**
   * User deletion operations
   */
  async clickDeleteButton() {
    await this.page.getByRole('button', { name: 'Delete User' }).click();
  }

  async confirmUserDeletion(_username: string) {
    await this.page.getByRole('button', { name: 'Delete User' }).last().click();
  }

  /**
   * High-level convenience methods
   * These combine multiple operations for common workflows
   */

  /**
   * Creates a user with the given username through the UI
   */
  async createUser(username: string) {
    return await test.step('Create user', async () => {
      await this.goToUsersList();
      await this.clickCreateUserButton();
      await this.page.getByRole('dialog').waitFor({ state: 'visible' });
      await this.fillUsername(username);
      await this.submitUserCreation();
      await this.page.getByTestId('user-created-successfully').waitFor({ state: 'visible' });
    });
  }

  /**
   * Deletes a user with the given username through the UI
   */
  async deleteUser(username: string) {
    return await test.step('Delete user', async () => {
      await this.goToUserDetails(username);
      await this.clickDeleteButton();
      await this.confirmUserDeletion(username);
    });
  }
}
