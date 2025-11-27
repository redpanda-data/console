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
    await this.page.goto(`/security/users/${username}/details`);
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
    await this.page.getByRole('button').getByText('Create').click({
      force: true,
    });
  }

  /**
   * User deletion operations
   */
  async clickDeleteButton() {
    await this.page.getByRole('button').getByText('Delete').click();
  }

  async confirmUserDeletion(username: string) {
    await this.page.getByPlaceholder(`Type "${username}" to confirm`).fill(username);
    await this.page.getByTestId('test-delete-item').click({
      force: true,
    });
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
      await this.page.waitForURL('/security/users/create');
      await this.fillUsername(username);
      await this.submitUserCreation();
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
