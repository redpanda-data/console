import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import {
  formatLabel,
  getIdFromRule,
  getRuleDataTestId,
  type OperationType,
  OperationTypeAllow,
  OperationTypeDeny,
  type Rule,
} from '../../../src/components/pages/acls/new-acl/acl.model';

/**
 * Page Object Model for ACL (Access Control List) pages
 * Handles both creation and detail view pages
 */
export class ACLPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigation methods
   */
  async goto() {
    await this.page.goto('/security/acls/create');
  }

  async gotoDetail(aclName: string) {
    await this.page.goto(`/security/acls/${aclName}/details`);
  }

  async gotoUpdate(aclName: string) {
    await this.page.goto(`/security/acls/${aclName}/update`);
  }

  async gotoList() {
    await this.page.goto('/security/acls');
  }

  async waitForDetailPage() {
    await this.page.waitForURL(/\/security\/acls\/.*\/details/);
  }

  async waitForUpdatePage() {
    await this.page.waitForURL(/\/security\/acls\/.*\/update/);
  }

  async clickUpdateButtonFromDetailPage() {
    // Click the update button from the ACL detail page to navigate to update page
    await this.page.getByTestId('update-acl-button').click();
  }

  /**
   * Form input methods
   */
  async setPrincipal(principal: string) {
    await this.page.getByTestId('shared-principal-input').fill(principal);
  }

  async setHost(host: string) {
    // Click on the host type dropdown
    const hostDropdown = this.page.getByTestId('shared-host-button');
    await hostDropdown.click();

    if (host === '*') {
      // Select "Allow all hosts" option
      await this.page.getByRole('option', { name: 'Allow all hosts' }).click();
    } else {
      // Select "Specific IP addresses" option and fill in the value
      await this.page.getByRole('option', { name: 'Specific IP addresses' }).click();

      // Wait for the input field to appear and fill it
      const hostInput = this.page.getByTestId('shared-host-input');
      await hostInput.waitFor({ state: 'visible' });
      await hostInput.fill(host);
    }
  }

  /**
   * Rule management methods
   */
  async addNewRule() {
    await this.page.getByTestId('add-acl-rule-button').click();
  }

  async removeRule(ruleIndex: number) {
    // Remove a specific rule by clicking its remove button
    await this.page.getByTestId(`remove-rule-button-${ruleIndex}`).click();
  }

  async clearAllRules() {
    // Clear all existing rules
    const removeButtons = await this.page.getByTestId(/^remove-rule-button-\d+$/).all();
    // Remove rules from the end to avoid index shifting issues
    for (let i = removeButtons.length - 1; i >= 0; i--) {
      await removeButtons[i].click();
      await this.page.waitForTimeout(100); // Small delay to ensure UI updates
    }
  }

  async selectResourceType(ruleIndex: number, rule: Rule) {
    // let's first check if the rule card is already visible/exists
    const ruleContextCardById = this.page.getByTestId(`card-content-rule-${getRuleDataTestId(rule)}`);
    if (await ruleContextCardById.isVisible()) {
      await ruleContextCardById.focus();
      return;
    }
    const ruleContextCard = this.page.locator(`.card-content-rule-${ruleIndex}`);
    const resourceButton = ruleContextCard.getByTestId(new RegExp(`rt-${rule.resourceType}-button-${ruleIndex}`));
    await resourceButton.click();
    await expect(resourceButton).toHaveClass(/bg-gray-900 text-white/);
  }

  async selectOperationPermission(ruleIndex: number, rule: Rule, operationName: string, permission: OperationType) {
    let ruleContextCard: Locator;
    const ruleContextCardById = this.page.getByTestId(`card-content-rule-${getRuleDataTestId(rule)}`);
    if (await ruleContextCardById.isVisible()) {
      ruleContextCard = ruleContextCardById;
    } else {
      ruleContextCard = this.page.locator(`.card-content-rule-${ruleIndex}`);
    }

    // Click on operation selector
    const operationSelector = ruleContextCard.getByTestId(`operation-select-${operationName}`).first();
    await operationSelector.click();

    // Select permission from dropdown
    await this.page
      .getByTestId(`ro-${getIdFromRule(rule, operationName, permission)}`)
      .first()
      .click();

    // Verify the operation shows the correct permission icon
    if (permission === OperationTypeAllow) {
      await expect(operationSelector.locator('svg.text-green-600')).toBeVisible();
    } else if (permission === OperationTypeDeny) {
      await expect(operationSelector.locator('svg.text-red-600')).toBeVisible();
    }
  }

  async selectPermissionMode(ruleIndex: number, mode: 'custom' | 'allow-all' | 'deny-all') {
    const modeButton = this.page.getByTestId(`mode-${mode}-button-${ruleIndex}`);
    await modeButton.click();
    // Wait for the button to be selected (has the active class)
    await expect(modeButton).toHaveClass(/bg-white text-gray-900 shadow-sm/);
  }

  async setSelectorType(ruleIndex: number, selectorType: string) {
    const selectorDropdown = this.page.getByTestId(`selector-type-select-${ruleIndex}`);
    await selectorDropdown.click();

    // Select the appropriate option based on selectorType
    if (selectorType === 'any') {
      await this.page.getByRole('option', { name: /All/i }).click();
    } else if (selectorType === 'literal') {
      await this.page.getByRole('option', { name: /matching/i }).click();
    } else if (selectorType === 'prefix') {
      await this.page.getByRole('option', { name: /starting with/i }).click();
    }
  }

  async setSelectorValue(ruleIndex: number, value: string) {
    const selectorInput = this.page.getByTestId(`selector-value-input-${ruleIndex}`);
    await selectorInput.fill(value);
  }

  async configureRule(ruleIndex: number, rule: Rule, isLastRule = false) {
    // Select resource type
    await this.selectResourceType(ruleIndex, rule);

    // Configure selector type and value if not Cluster or SchemaRegistry
    if (rule.resourceType !== 'cluster' && rule.resourceType !== 'schemaRegistry') {
      // Set selector type if specified and different from default
      if (rule.selectorType && rule.selectorType !== 'any') {
        await this.setSelectorType(ruleIndex, rule.selectorType);

        // Set selector value if it's literal or prefix type
        if ((rule.selectorType === 'literal' || rule.selectorType === 'prefix') && rule.selectorValue) {
          await this.setSelectorValue(ruleIndex, rule.selectorValue);
        }
      }
    }

    // Check if we need to set the mode
    if (rule.mode === 'allowAll') {
      await this.selectPermissionMode(ruleIndex, 'allow-all');
    } else if (rule.mode === 'denyAll') {
      await this.selectPermissionMode(ruleIndex, 'deny-all');
    } else {
      // Set operations for this rule only if in custom mode
      for (const [operationName, permission] of Object.entries(rule.operations)) {
        await this.selectOperationPermission(ruleIndex, rule, operationName, permission);
      }
    }

    // Add new rule if not the last one
    if (!isLastRule) {
      await this.addNewRule();
    }
  }

  async configureRules(rules: Rule[]) {
    for (let i = 0; i < rules.length; i++) {
      const isLastRule = i === rules.length - 1;
      await this.configureRule(i, rules[i], isLastRule);
    }
  }

  async updateRules(rulesToUpdate: Rule[]) {
    // Get current number of rule cards on the page to track the index for new rules
    let existingRuleCards = await this.page.locator('[class*="card-content-rule-"]').count();
    let needsNewRuleButton = true;

    for (let i = 0; i < rulesToUpdate.length; i++) {
      const rule = rulesToUpdate[i];
      const ruleTestId = getRuleDataTestId(rule);
      const ruleCard = this.page.getByTestId(`card-content-rule-${ruleTestId}`);

      // Check if this rule already exists
      if (await ruleCard.isVisible()) {
        // Find the actual index of this rule card
        const allRuleCards = await this.page.locator('[class*="card-content-rule-"]').all();
        let ruleCardIndex = -1;
        for (let j = 0; j < allRuleCards.length; j++) {
          const testId = await allRuleCards[j].getAttribute('data-testid');
          if (testId?.includes(ruleTestId)) {
            ruleCardIndex = j;
            break;
          }
        }

        if (ruleCardIndex >= 0) {
          // Update selector if needed
          if (rule.resourceType !== 'cluster' && rule.resourceType !== 'schemaRegistry' && rule.selectorType) {
            await this.setSelectorType(ruleCardIndex, rule.selectorType);

            if ((rule.selectorType === 'literal' || rule.selectorType === 'prefix') && rule.selectorValue) {
              await this.setSelectorValue(ruleCardIndex, rule.selectorValue);
            }
          }

          // Rule exists, check if we need to change the mode
          if (rule.mode === 'allowAll') {
            await this.selectPermissionMode(ruleCardIndex, 'allow-all');
          } else if (rule.mode === 'denyAll') {
            await this.selectPermissionMode(ruleCardIndex, 'deny-all');
          } else if (rule.mode === 'custom') {
            await this.selectPermissionMode(ruleCardIndex, 'custom');
            // Update individual operations only if in custom mode
            for (const [operationName, permission] of Object.entries(rule.operations)) {
              await this.selectOperationPermission(ruleCardIndex, rule, operationName, permission);
            }
          }
        }
      } else {
        // Rule doesn't exist, create a new one
        const isLastRule = i === rulesToUpdate.length - 1;

        // Add new rule card if needed
        if (needsNewRuleButton) {
          await this.addNewRule();
          needsNewRuleButton = false;
          const cards = await this.page.locator('[class*="card-content-rule-"]').all();
          existingRuleCards = cards.length - 1; // New rule is added at the end
        }

        // Configure the new rule using the current index
        await this.configureRule(existingRuleCards, rule, isLastRule);
        existingRuleCards++;

        // If not the last rule, we'll need to add another button for the next new rule
        if (!isLastRule) {
          needsNewRuleButton = true;
        }
      }
    }
  }

  async deleteRules(rulesToDelete: Rule[]) {
    // Delete rules based on the removedRules array
    for (const rule of rulesToDelete) {
      const ruleTestId = getRuleDataTestId(rule);
      const removeButton = this.page.getByTestId(`remove-rule-button-${ruleTestId}`);

      // Check if the remove button exists and is visible
      if (await removeButton.isVisible()) {
        await removeButton.click();
        // Wait briefly for UI to update after deletion
        await this.page.waitForTimeout(200);
      }
    }
  }

  /**
   * select allow all operations
   */
  async allowAllButton() {
    const allowAllButton = this.page.getByTestId('add-allow-all-operations-button').first();
    await allowAllButton.waitFor({ state: 'visible' });
    await allowAllButton.click();
  }

  /**
   * Form submission
   */
  async submitForm() {
    await this.page.waitForTimeout(1000); // Give UI time to settle
    const submitButton = this.page.getByTestId('submit-acl-button').first();
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(500); // Brief pause before click
    await submitButton.click();
  }

  /**
   * Summary validation methods
   */
  async validateSummaryItem(rule: Rule, operationName: string, permission: string) {
    const summaryItem = this.page.getByTestId(`${getRuleDataTestId(rule)}-op-${operationName}`);
    await expect(summaryItem).toBeVisible();

    // Verify the text content matches the expected format
    const expectedText = `${formatLabel(operationName)}: ${permission.toLowerCase()}`;
    await expect(summaryItem).toHaveText(expectedText);

    // Verify the correct color class based on permission
    if (permission === OperationTypeAllow) {
      await expect(summaryItem).toHaveClass(/bg-green-100 text-green-800/);
    } else if (permission === OperationTypeDeny) {
      await expect(summaryItem).toHaveClass(/bg-red-100 text-red-800/);
    }
  }

  async validateSummaryRule(_ruleIndex: number, rule: Rule) {
    // Check that the summary rule exists
    const summaryRule = this.page.getByTestId(`summary-card-${getRuleDataTestId(rule)}`).first();
    await expect(summaryRule).toBeVisible();

    // Check the rule title
    const summaryTitle = this.page.getByTestId(`${getRuleDataTestId(rule)}-title`).first();
    await expect(summaryTitle).toBeVisible();

    // Check if mode is Allow All or Deny All
    if (rule.mode === 'allowAll') {
      // Should show "Allow all" label
      await expect(summaryRule.locator('text=Allow all')).toBeVisible();
    } else if (rule.mode === 'denyAll') {
      // Should show "Deny all" label
      await expect(summaryRule.locator('text=Deny all')).toBeVisible();
    } else {
      // Should show individual operation items
      for (const [operationName, permission] of Object.entries(rule.operations)) {
        await this.validateSummaryItem(rule, operationName, permission);
      }
    }
  }

  async validateAllSummaryRules(rules: Rule[]) {
    for (let i = 0; i < rules.length; i++) {
      await this.validateSummaryRule(i, rules[i]);
    }
  }

  /**
   * Detail page validation methods
   */
  async validateDetailOperationItem(
    rule: Rule,
    _principal: string,
    operationName: string,
    permission: OperationType,
    _host = '*',
  ) {
    const detailOperationItem = this.page.getByTestId(
      `detail-item-op-${getIdFromRule(rule, operationName, permission)}`,
    );
    await expect(detailOperationItem).toBeVisible();

    // Verify the text content matches
    const expectedText = `${formatLabel(operationName)}: ${permission.toLowerCase()}`;
    await expect(detailOperationItem).toHaveText(expectedText);

    // Verify correct styling
    if (permission === OperationTypeAllow) {
      await expect(detailOperationItem).toHaveClass(/bg-green-100 text-green-800/);
    } else if (permission === OperationTypeDeny) {
      await expect(detailOperationItem).toHaveClass(/bg-red-100 text-red-800/);
    }
  }

  async validateDetailRule(_ruleIndex: number, rule: Rule, principal: string, host = '*') {
    // Check that the summary card for this rule exists on detail page
    const detailRuleCard = this.page.getByTestId(`summary-card-${getRuleDataTestId(rule)}`);
    await expect(detailRuleCard).toBeVisible();

    // Add a small wait to ensure the page is loaded
    await this.page.waitForTimeout(500);

    // Check if all operations have the same value (which would display as Allow all or Deny all)
    const operations = Object.values(rule.operations);
    const allSame = rule.mode === 'allowAll' || rule.mode === 'denyAll';

    if (allSame && operations.length > 0) {
      if (operations[0] === OperationTypeAllow) {
        // Check if "Allow all" text is visible, or if all individual operations show allow
        const allowAll = detailRuleCard.getByTestId(`detail-item-op-${getIdFromRule(rule, 'ALL', OperationTypeAllow)}`);
        await expect(allowAll).toBeVisible();
      } else if (operations[0] === OperationTypeDeny) {
        // Check if "Deny all" text is visible, or if all individual operations show deny
        const denyAll = detailRuleCard.getByTestId(`detail-item-op-${getIdFromRule(rule, 'ALL', OperationTypeDeny)}`);
        await expect(denyAll).toBeVisible();
      } else {
        // Verify each operation item is present
        for (const [operationName, permission] of Object.entries(rule.operations)) {
          await this.validateDetailOperationItem(rule, principal, operationName, permission, host);
        }
      }
    } else {
      // Mixed operations, verify each operation item is present
      for (const [operationName, permission] of Object.entries(rule.operations)) {
        await this.validateDetailOperationItem(rule, principal, operationName, permission, host);
      }
    }
  }

  async validateAllDetailRules(rules: Rule[], principal: string, host = '*') {
    for (let i = 0; i < rules.length; i++) {
      await this.validateDetailRule(i, rules[i], principal, host);
    }
  }

  async validateRulesCount(expectedCount: number) {
    const rulesHeader = this.page.getByTestId('acl-rules-length').first();
    await expect(rulesHeader).toHaveText(`ACL rules (${expectedCount})`);
  }

  async validateSharedConfig() {
    const sharedConfigCard = this.page.getByTestId('share-config-title');
    await expect(sharedConfigCard).toBeVisible();
  }

  async validateListItem(host: string, principal: string) {
    await this.gotoList();
    // Validate that the ACL list item is visible with correct host and principal
    await this.page.getByTestId('search-field-input').fill(principal);
    const listItem = this.page.getByTestId(`acl-list-item-${principal}-${host}`);
    await expect(listItem).toBeVisible({ timeout: 1000 });
  }

  /**
   * Validation methods for checking rule existence
   */
  async validateRuleExists(rule: Rule, _principal: string, _hostt = '*'): Promise<boolean> {
    // Check if a specific rule exists on the detail page
    try {
      // Check if at least one operation from the rule is visible
      for (const [operationName, permission] of Object.entries(rule.operations)) {
        const testId = `detail-item-op-${getIdFromRule(rule, operationName, permission)}`;
        const element = this.page.getByTestId(testId);
        if (await element.isVisible({ timeout: 1000 })) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async validateRuleNotExists(rule: Rule, _principal: string, _hostt = '*') {
    // Verify that a specific rule does not exist on the detail page
    for (const [operationName, permission] of Object.entries(rule.operations)) {
      const testId = `detail-item-op-${getIdFromRule(rule, operationName, permission)}`;
      const element = this.page.getByTestId(testId);
      await expect(element).not.toBeVisible();
    }
  }

  /**
   * Resource type button validation methods
   */
  async validateResourceTypeButtonDisabled(ruleIndex: number, resourceType: string) {
    const button = this.page.getByTestId(`rt-${resourceType}-button-${ruleIndex}`);
    await expect(button).toBeDisabled();
  }

  /**
   * Helper methods
   */
  getRuleContextCard(ruleIndex: number): Locator {
    return this.page.locator(`.card-content-rule-${ruleIndex}`);
  }

  async waitForStability(timeout = 1000) {
    await this.page.waitForTimeout(timeout);
  }
}
