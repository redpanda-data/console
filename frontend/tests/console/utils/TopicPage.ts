/** biome-ignore-all lint/performance/useTopLevelRegex: this is a test */
import { expect, type Page, test } from '@playwright/test';

/**
 * Page Object Model for Topic pages
 * Encapsulates common topic-related operations for E2E tests
 */
export class TopicPage {
  constructor(protected page: Page) {}

  /**
   * Navigation methods
   */
  async goToTopicsList() {
    await this.page.goto('/topics');
    await expect(this.page.getByTestId('create-topic-button')).toBeVisible();
  }

  async goToTopicDetails(topicName: string) {
    await this.page.goto(`/topics/${topicName}`);
    await expect(this.page.getByText(topicName)).toBeVisible();
  }

  async goToTopicTab(topicName: string, tab: 'messages' | 'configuration' | 'partitions' | 'consumers') {
    await this.page.goto(`/topics/${topicName}#${tab}`);
  }

  async goToProduceRecord(topicName: string) {
    await this.page.goto(`/topics/${topicName}/produce-record`);
    await expect(this.page.getByTestId('produce-button')).toBeVisible();
  }

  /**
   * Topic list operations
   */
  async clickCreateTopicButton() {
    await this.page.getByTestId('create-topic-button').click();
    await expect(this.page.getByTestId('topic-name')).toBeVisible({ timeout: 5000 });
  }

  async searchTopics(searchTerm: string) {
    const searchInput = this.page.getByTestId('search-field-input');
    await searchInput.fill(searchTerm);
  }

  async clearSearch() {
    const searchInput = this.page.getByTestId('search-field-input');
    await searchInput.clear();
  }

  async toggleInternalTopics(checked: boolean) {
    const checkbox = this.page.getByTestId('show-internal-topics-checkbox');
    if (checked) {
      await checkbox.check();
    } else {
      await checkbox.uncheck();
    }
  }

  async clickTopicLink(topicName: string) {
    await this.page.getByTestId(`topic-link-${topicName}`).click();
  }

  async verifyTopicInList(topicName: string) {
    await expect(this.page.getByTestId(`topic-link-${topicName}`)).toBeVisible();
  }

  async verifyTopicNotInList(topicName: string) {
    await expect(this.page.getByTestId(`topic-link-${topicName}`)).not.toBeVisible();
  }

  /**
   * Topic creation operations
   */
  async fillTopicName(topicName: string) {
    await this.page.getByTestId('topic-name').fill(topicName);
  }

  async fillPartitions(partitions: string) {
    const partitionsInput = this.page.getByPlaceholder(/partitions/i);
    if (await partitionsInput.isVisible()) {
      await partitionsInput.fill(partitions);
    }
  }

  async fillReplicationFactor(replicationFactor: string) {
    const replicationInput = this.page.getByPlaceholder(/replication/i);
    if ((await replicationInput.isVisible()) && !(await replicationInput.isDisabled())) {
      await replicationInput.fill(replicationFactor);
    }
  }

  async submitTopicCreation() {
    await this.page.getByTestId('onOk-button').click();
  }

  async closeSuccessModal() {
    await expect(this.page.getByTestId('create-topic-success__close-button')).toBeVisible();
    await this.page.getByTestId('create-topic-success__close-button').click();
  }

  async cancelTopicCreation() {
    await this.page.getByRole('button', { name: 'Cancel' }).click();
  }

  async verifyCreateButtonDisabled() {
    await expect(this.page.getByTestId('onOk-button')).toBeDisabled();
  }

  async verifyCreateButtonEnabled() {
    await expect(this.page.getByTestId('onOk-button')).toBeEnabled();
  }

  /**
   * Topic details operations
   */
  async verifyTopicDetailsVisible(topicName: string) {
    await expect(this.page).toHaveURL(new RegExp(`/topics/${topicName}`));
    await expect(this.page.getByText(topicName)).toBeVisible();
  }

  async verifyTabsVisible() {
    await expect(this.page.getByRole('tablist')).toBeVisible({ timeout: 10_000 });
  }

  async clickProduceRecordButton() {
    await this.page.getByTestId('produce-record-button').click();
  }

  /**
   * Message operations
   */
  async expandFirstMessage() {
    await this.page.getByLabel('Collapse row').first().click();
  }

  async clickDownloadRecord() {
    await this.page.getByText('Download Record').click();
  }

  async selectExportFormat(format: 'json' | 'csv') {
    if (format === 'csv') {
      await this.page.getByTestId('csv_field').click();
    }
    // JSON is default, no action needed
  }

  async confirmExport() {
    const dialog = this.page.getByRole('dialog', { name: /save message/i });
    const saveButton = dialog.getByRole('button', { name: /save/i });
    await saveButton.click();
  }

  async copyMessageValue() {
    await this.page.getByRole('button', { name: /copy value/i }).click();
  }

  async verifyClipboardContent(expectedContent: string) {
    const clipboardText = await this.page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(expectedContent);
  }

  async fillQuickSearch(searchTerm: string) {
    const searchInput = this.page.getByTestId('message-quick-search-input');
    await searchInput.fill(searchTerm);
    await this.page.keyboard.press('Enter');
  }

  async verifyPayloadContentVisible() {
    await expect(this.page.getByTestId('payload-content')).toBeVisible({ timeout: 5000 });
  }

  /**
   * Configuration tab operations
   */
  async verifyConfigurationGroupsVisible() {
    await expect(this.page.getByTestId('config-group-table')).toBeVisible();
  }

  async verifyConfigurationGroup(groupName: string) {
    await expect(this.page.locator('.configGroupTitle').filter({ hasText: groupName })).toBeVisible();
  }

  async getConfigurationGroups(): Promise<string[]> {
    return await this.page.locator('.configGroupTitle').allTextContents();
  }

  /**
   * Breadcrumb navigation
   */
  async clickTopicsBreadcrumb() {
    await this.page.getByRole('link', { name: 'Topics' }).first().click();
  }

  async verifyOnTopicsListPage() {
    await expect(this.page).toHaveURL(/\/topics\/?(\?.*)?$/);
  }

  /**
   * Produce message operations
   */
  async fillValueEditor(content: string) {
    const valueEditor = this.page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
    await valueEditor.click();
    await this.page.keyboard.insertText(content);
  }

  async fillKeyEditor(content: string) {
    const keyEditor = this.page.getByTestId('produce-key-editor').locator('.monaco-editor').first();
    await keyEditor.click();
    await this.page.keyboard.insertText(content);
  }

  async clickProduceButton() {
    await this.page.getByTestId('produce-button').click();
  }

  async pasteIntoValueEditor(content: string) {
    const monacoEditor = this.page.getByTestId('produce-value-editor').locator('.monaco-editor').first();
    await monacoEditor.click();
    await this.page.evaluate(`navigator.clipboard.writeText("${content}")`);
    await this.page.keyboard.press('Control+KeyV');
    await this.page.keyboard.press('Meta+KeyV');
  }

  async verifyMessageProduced(message: string) {
    await expect(this.page.getByRole('cell', { name: new RegExp(message, 'i') }).first()).toBeVisible({
      timeout: 10_000,
    });
  }

  async clickLoadAnywayButton() {
    await this.page.getByTestId('load-anyway-button').click();
  }

  async verifyMessageInTopic(message: string) {
    await expect(this.page.getByText(message)).toBeVisible();
  }

  /**
   * High-level convenience methods
   * These combine multiple operations for common workflows
   */

  /**
   * Creates a topic with the given name through the UI
   * Includes verification that the topic appears in the list
   */
  async createTopic(topicName: string) {
    return await test.step('Create topic', async () => {
      await this.goToTopicsList();
      await this.clickCreateTopicButton();
      await this.fillTopicName(topicName);
      await this.submitTopicCreation();
      await this.closeSuccessModal();
      await this.verifyTopicInList(topicName);
    });
  }

  /**
   * Deletes a topic with the given name through the UI
   * Includes verification that the topic is removed from the list
   */
  async deleteTopic(topicName: string) {
    return await test.step('Delete topic', async () => {
      await this.goToTopicsList();
      await this.verifyTopicInList(topicName); // Verify topic exists
      await this.page.getByTestId(`delete-topic-button-${topicName}`).click();
      await this.page.getByTestId('delete-topic-confirm-button').click();
      await expect(this.page.getByText('Topic Deleted')).toBeVisible();
      await this.verifyTopicNotInList(topicName);
    });
  }

  /**
   * Produces a message to the specified topic through the UI
   * Includes verification that the message appears in the topic
   */
  async produceMessage(topicName: string, message: string) {
    return await test.step('Produce message', async () => {
      await this.goToProduceRecord(topicName);
      await this.fillValueEditor(message);
      await this.clickProduceButton();
      await this.verifyMessageProduced(message);
    });
  }
}
