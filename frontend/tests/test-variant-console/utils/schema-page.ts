/** biome-ignore-all lint/performance/useTopLevelRegex: this is a test */
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Helper function to select an option from a custom Select component (react-select based)
 * @param selectContainer - The locator for the select container (with data-testid)
 * @param optionText - The text of the option to select
 */
async function selectCustomOption(selectContainer: Locator, optionText: string) {
  // Click on the select to open the dropdown
  await selectContainer.click();

  // Wait for and click the option with matching text
  const option = selectContainer.page().getByText(optionText, { exact: true });
  await option.click();
}

/**
 * Page Object Model for Schema Registry pages
 * Handles schema creation, version management, compatibility editing, and navigation
 */
export class SchemaPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigation methods
   */
  async goto() {
    await this.page.goto('/schema-registry');
    await expect(this.page.getByRole('heading', { name: /schema registry/i })).toBeVisible();
  }

  async gotoCreate() {
    await this.page.goto('/schema-registry/create', { waitUntil: 'networkidle' });
    await expect(this.page.getByRole('heading', { name: /create schema/i }).first()).toBeVisible();
  }

  async gotoDetails(subjectName: string, version?: number | 'latest') {
    const versionParam = version ? `?version=${version}` : '?version=latest';
    await this.page.goto(`/schema-registry/subjects/${encodeURIComponent(subjectName)}${versionParam}`);
    await expect(this.page.getByRole('heading', { name: subjectName })).toBeVisible();
  }

  async gotoEditCompatibility(subjectName?: string) {
    const url = subjectName
      ? `/schema-registry/subjects/${encodeURIComponent(subjectName)}/edit-compatibility`
      : '/schema-registry/edit-compatibility';
    await this.page.goto(url);
    await expect(this.page.getByRole('heading', { name: /edit.*compatibility/i })).toBeVisible();
  }

  /**
   * Schema creation methods
   */
  async createSchema(params: {
    strategy: 'TOPIC_NAME' | 'RECORD_NAME' | 'TOPIC_RECORD_NAME' | 'CUSTOM';
    format: 'AVRO' | 'PROTOBUF' | 'JSON';
    topicName?: string;
    keyOrValue?: 'key' | 'value';
    subjectName?: string;
    schemaDefinition: string;
    references?: Array<{
      name: string;
      subject: string;
      version: number;
    }>;
    validate?: boolean;
  }) {
    await this.gotoCreate();

    // Map strategy values to their display labels
    const strategyLabels = {
      TOPIC_NAME: 'Topic Name',
      RECORD_NAME: 'Record Name',
      TOPIC_RECORD_NAME: 'Topic-Record Name',
      CUSTOM: 'Custom',
    };

    // Select strategy using custom select component
    const strategySelect = this.page.getByTestId('schema-create-strategy-select');
    await selectCustomOption(strategySelect, strategyLabels[params.strategy]);

    // Select format
    const formatRadio = this.page.getByTestId('schema-create-format-radio');
    await formatRadio.getByRole('radio', { name: params.format }).click();

    // Fill in topic and key/value if using TOPIC strategy
    if (params.strategy === 'TOPIC_NAME' && params.topicName) {
      const topicSelect = this.page.getByTestId('schema-create-topic-select');
      // For topic select, we also need to use custom select
      await selectCustomOption(topicSelect, params.topicName);

      if (params.keyOrValue) {
        const keyValueRadio = this.page.getByTestId('schema-create-key-value-radio');
        await keyValueRadio.getByRole('radio', { name: params.keyOrValue }).click();
      }
    }

    // Fill in subject name if using CUSTOM strategy
    if (params.strategy === 'CUSTOM' && params.subjectName) {
      const subjectInput = this.page.getByTestId('schema-create-subject-name-input');
      await subjectInput.fill(params.subjectName);
    }

    // Fill in schema definition
    const schemaEditor = this.page.getByTestId('schema-create-schema-editor');
    await schemaEditor.fill(params.schemaDefinition);

    // Add references if provided
    if (params.references && params.references.length > 0) {
      for (let i = 0; i < params.references.length; i++) {
        const ref = params.references[i];

        // Click add reference button
        const addRefButton = this.page.getByTestId('schema-create-add-reference-btn');
        await addRefButton.click();

        // Fill in reference details
        const nameInput = this.page.getByTestId(`schema-create-reference-name-input-${i}`);
        await nameInput.fill(ref.name);

        // Use custom select for subject and version dropdowns
        const subjectSelect = this.page.getByTestId(`schema-create-reference-subject-select-${i}`);
        await selectCustomOption(subjectSelect, ref.subject);

        const versionSelect = this.page.getByTestId(`schema-create-reference-version-select-${i}`);
        await selectCustomOption(versionSelect, ref.version.toString());
      }
    }

    // Validate if requested
    if (params.validate) {
      await this.validateSchema();
    }

    // Save schema
    const saveButton = this.page.getByTestId('schema-create-save-btn');
    await saveButton.click();

    // Wait for navigation to details page
    await expect(this.page).toHaveURL(/\/schema-registry\/subjects\/.+/, { timeout: 10_000 });
  }

  async validateSchema() {
    const validateButton = this.page.getByTestId('schema-create-validate-btn');
    await validateButton.click();
  }

  async addReference(params: { name: string; subject: string; version: number }) {
    const addRefButton = this.page.getByTestId('schema-create-add-reference-btn');
    await addRefButton.click();

    // Get the index of the newly added reference
    const referenceInputs = await this.page.getByTestId(/schema-create-reference-name-input-\d+/).all();
    const index = referenceInputs.length - 1;

    const nameInput = this.page.getByTestId(`schema-create-reference-name-input-${index}`);
    await nameInput.fill(params.name);

    // Use custom select for subject and version dropdowns
    const subjectSelect = this.page.getByTestId(`schema-create-reference-subject-select-${index}`);
    await selectCustomOption(subjectSelect, params.subject);

    const versionSelect = this.page.getByTestId(`schema-create-reference-version-select-${index}`);
    await selectCustomOption(versionSelect, params.version.toString());
  }

  async cancelCreation() {
    const cancelButton = this.page.getByTestId('schema-create-cancel-btn');
    await cancelButton.click();

    // Should navigate back to list
    await expect(this.page).toHaveURL('/schema-registry/?showSoftDeleted=false');
  }

  async recoverVersion() {
    const recoverButton = this.page.getByTestId('schema-definition-recover-btn');
    await expect(recoverButton).toBeVisible();
    await recoverButton.click();

    // Confirm in modal
    const confirmButton = this.page.getByRole('button', { name: /confirm|recover|yes/i });
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }
  }

  async switchVersion(versionNumber: number) {
    const versionSelect = this.page.getByTestId('schema-definition-version-select');
    await selectCustomOption(versionSelect, versionNumber.toString());
  }

  async addVersion(schemaDefinition: string) {
    const addVersionButton = this.page.getByTestId('schema-details-add-version-btn');
    await expect(addVersionButton).toBeVisible();
    await addVersionButton.click();

    // Fill in schema definition
    const schemaEditor = this.page.getByTestId('schema-create-schema-editor');
    await schemaEditor.fill(schemaDefinition);

    // Save
    const saveButton = this.page.getByTestId('schema-create-save-btn');
    await saveButton.click();
  }

  /**
   * Compatibility editing methods
   */
  async editGlobalCompatibility(mode: string) {
    await this.gotoEditCompatibility();
    await this.selectCompatibilityMode(mode);
    await this.saveCompatibility();
  }

  async editSubjectCompatibility(subjectName: string, mode: string) {
    await this.gotoEditCompatibility(subjectName);
    await this.selectCompatibilityMode(mode);
    await this.saveCompatibility();
  }

  async selectCompatibilityMode(mode: string) {
    const radioGroup = this.page.getByTestId('edit-compatibility-mode-radio');
    await radioGroup.getByRole('radio', { name: new RegExp(mode, 'i') }).click();
  }

  async saveCompatibility() {
    const saveButton = this.page.getByTestId('edit-compatibility-save-btn');
    await saveButton.click();
  }

  async cancelCompatibilityEdit() {
    const cancelButton = this.page.getByTestId('edit-compatibility-cancel-btn');
    await cancelButton.click();
  }

  /**
   * Search and filtering methods
   */
  async searchSchemas(query: string) {
    const searchFieldWrapper = this.page.getByTestId('schema-list-search-field');
    const searchInput = searchFieldWrapper.locator('input');
    await searchInput.fill(query);
  }

  async toggleSoftDeleted(enabled: boolean) {
    const checkbox = this.page.getByTestId('schema-list-show-soft-deleted-checkbox');
    if (enabled) {
      await checkbox.check();
    } else {
      await checkbox.uncheck();
    }
  }

  async clickCreateButton() {
    const createButton = this.page.getByTestId('schema-list-create-btn');
    await expect(createButton).toBeVisible();
    await createButton.click();
    await expect(this.page).toHaveURL('/schema-registry/create');
  }

  async clickEditCompatibilityButton() {
    const editButton = this.page.getByTestId('schema-list-edit-compatibility-btn');
    await expect(editButton).toBeVisible();
    await editButton.click();
    await expect(this.page).toHaveURL('/schema-registry/edit-compatibility');
  }

  /**
   * Verification methods
   */
  async verifySchemaInList(subjectName: string) {
    const schemaLink = this.page.getByRole('link', { name: subjectName, exact: true });
    await expect(schemaLink).toBeVisible();
  }

  async verifySchemaNotInList(subjectName: string) {
    const schemaLink = this.page.getByRole('link', { name: subjectName, exact: true });
    await expect(schemaLink).not.toBeVisible();
  }

  async verifySchemaDetails(subjectName: string) {
    await expect(this.page.getByRole('heading', { name: subjectName })).toBeVisible();
    const codeBlock = this.page.getByTestId('schema-definition-code-block');
    await expect(codeBlock).toBeVisible();
  }

  async verifyVersionCount(count: number) {
    const versionSelect = this.page.getByTestId('schema-definition-version-select');
    const options = await versionSelect.locator('option').count();
    expect(options).toBe(count);
  }

  async verifyCompatibilityMode(mode: string) {
    const description = this.page.getByTestId('edit-compatibility-description');
    await expect(description).toBeVisible();

    const radioGroup = this.page.getByTestId('edit-compatibility-mode-radio');
    const selectedRadio = radioGroup.locator('input[type="radio"]:checked');
    const selectedValue = await selectedRadio.getAttribute('value');
    expect(selectedValue).toBe(mode);
  }

  async verifySoftDeleted() {
    const softDeletedAlert = this.page.getByTestId('schema-definition-soft-deleted-alert');
    await expect(softDeletedAlert).toBeVisible();
  }

  async verifyReferences(referenceSubjects: string[]) {
    const referencesList = this.page.getByTestId('schema-references-list');
    await expect(referencesList).toBeVisible();

    for (const refSubject of referenceSubjects) {
      const refLink = this.page.getByTestId(`schema-reference-link-${refSubject}`);
      await expect(refLink).toBeVisible();
    }
  }

  async verifyReferencedBy(referencingSubjects: string[]) {
    const referencedByList = this.page.getByTestId('schema-referenced-by-list');
    await expect(referencedByList).toBeVisible();

    for (const refSubject of referencingSubjects) {
      const refLink = this.page.getByTestId(`schema-referenced-by-link-${refSubject}`);
      await expect(refLink).toBeVisible();
    }
  }

  async verifyValidationError() {
    const errorAlert = this.page.getByTestId('schema-create-validation-error-alert');
    await expect(errorAlert).toBeVisible();
  }

  /**
   * Helper methods
   */
  async getCurrentVersion(): Promise<number> {
    const versionSelect = this.page.getByTestId('schema-definition-version-select');
    const selectedValue = await versionSelect.inputValue();
    return Number.parseInt(selectedValue, 10);
  }

  async getSchemaId(): Promise<number> {
    const schemaIdElement = this.page.getByTestId('schema-definition-schema-id');
    const text = await schemaIdElement.textContent();
    return Number.parseInt(text?.trim() || '0', 10);
  }
}
