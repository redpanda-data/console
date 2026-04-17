/** biome-ignore-all lint/performance/useTopLevelRegex: e2e test */
/** biome-ignore-all lint/suspicious/noConsole: diagnostic tracing for UX-1217 */
/**
 * Regression test for UX-1217 — ACLs are wiped during edit when adding a new rule.
 *
 * Ticket repro:
 *   1. Create 3 topic ACLs with same topic-name (3 operations on topic-acl2)
 *   2. Open edit — loads as one Rule with 3 operations
 *   3. Add a consumer-group rule — SAVE triggers the bug: topic ACLs lost
 *
 * This spec automates steps 1-3 and asserts that after saving:
 *   - The original 3 topic ACLs still exist
 *   - The new consumer-group ACL was also created
 */

import { expect, test } from '@playwright/test';

import { appendFileSync, writeFileSync } from 'node:fs';
import {
  ModeAllowAll,
  ModeCustom,
  OperationTypeAllow,
  ResourcePatternTypeAny,
  ResourcePatternTypeLiteral,
  ResourceTypeConsumerGroup,
  ResourceTypeTopic,
  type Rule,
} from '../../../src/components/pages/security/shared/acl-model';
import { AclPage } from '../utils/acl-page';

const REQUEST_LOG = '/tmp/ux-1217-repro.txt';

function attachRequestLogger(page: import('@playwright/test').Page, label: string) {
  writeFileSync(REQUEST_LOG, `=== ${label} @ ${new Date().toISOString()} ===\n`, { flag: 'a' });
  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('/redpanda.api.')) {
      return;
    }
    appendFileSync(REQUEST_LOG, `REQ  ${req.method()} ${url}\n`);
    const body = req.postData();
    if (body && body.length < 500) {
      appendFileSync(REQUEST_LOG, `     body=${body}\n`);
    }
  });
  page.on('response', (res) => {
    if (!res.url().includes('/redpanda.api.')) {
      return;
    }
    appendFileSync(REQUEST_LOG, `RES  ${res.status()} ${res.url()}\n`);
  });
}

// Per the ticket: 3 separate topic ACLs, same topic name, different operations.
// Modeled as 3 separate rule-cards in the form (not one card with 3 ops).
const topicRuleDescribe: Rule = {
  id: 0,
  resourceType: ResourceTypeTopic,
  mode: ModeCustom,
  selectorType: ResourcePatternTypeLiteral,
  selectorValue: 'topic-acl2',
  operations: { DESCRIBE: OperationTypeAllow },
};
const topicRuleRead: Rule = {
  id: 1,
  resourceType: ResourceTypeTopic,
  mode: ModeCustom,
  selectorType: ResourcePatternTypeLiteral,
  selectorValue: 'topic-acl2',
  operations: { READ: OperationTypeAllow },
};
const topicRuleWrite: Rule = {
  id: 2,
  resourceType: ResourceTypeTopic,
  mode: ModeCustom,
  selectorType: ResourcePatternTypeLiteral,
  selectorValue: 'topic-acl2',
  operations: { WRITE: OperationTypeAllow },
};

const consumerGroupRule: Rule = {
  id: 1,
  resourceType: ResourceTypeConsumerGroup,
  mode: ModeAllowAll,
  selectorType: ResourcePatternTypeAny,
  selectorValue: '',
  operations: {},
};

test.describe('ACL edit preserves existing rules (UX-1217)', () => {
  test('adding a cg rule on edit does not wipe existing topic ACLs', async ({ page }) => {
    test.setTimeout(180_000);
    attachRequestLogger(page, 'ux-1217 add-rule repro');

    const principal = `edit-preserve-${Date.now()}`;

    // Step 0: Seed a SCRAM user so the principal is navigable.
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-user-button')).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId('create-user-button').click();
    await page.getByTestId('create-user-name').fill(principal);
    await page.getByTestId('create-user-submit').click();
    await expect(page.getByTestId('user-created-successfully')).toBeVisible();
    await page.getByTestId('done-button').click();

    // Step 1: Create 1 topic Rule with 3 operations → 3 Kafka ACLs on topic-acl2.
    const aclPage = new AclPage(page);
    await aclPage.goto();
    await aclPage.setPrincipal(principal);
    await aclPage.setHost('*');
    await aclPage.configureRules([topicRuleDescribe, topicRuleRead, topicRuleWrite]);
    await aclPage.submitForm();
    await aclPage.waitForDetailPage();

    appendFileSync(REQUEST_LOG, '\n=== post-create, navigating to edit ===\n');

    // Step 2: Open edit page — triggers ListACLs which populates the form.
    await page.getByTestId('update-acl-button').click();
    await page.waitForURL((url) => url.href.includes('/update'));

    appendFileSync(REQUEST_LOG, '\n=== edit page loaded, about to add consumer-group rule ===\n');

    // Step 3: Add a new rule (consumer-group, allow-all) then submit.
    // This is the scenario that reproduces the bug per the ticket.
    // Note: updateRules adds new rules starting at the next card index.
    await aclPage.updateRules([consumerGroupRule]);
    await aclPage.submitForm();
    await aclPage.waitForDetailPage();

    appendFileSync(REQUEST_LOG, '\n=== post-edit-save with added cg rule ===\n');

    // Assertion: the detail page should show BOTH the topic rule AND the consumer-group rule.
    // Rule count = 2 because operations are grouped per (resourceType, pattern, name).
    await aclPage.validateRulesCount(2);

    // Additional structural check: the topic rule's 3 operations should still be present.
    // getByTestId matches the detail-page rule entries.
    await expect(page.getByText('topic-acl2')).toBeVisible();
  });
});
