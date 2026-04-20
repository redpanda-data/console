/**
 * Regression test for UX-1217 / UX-1219 — adding a rule on edit must not wipe existing ACLs.
 *
 * Pre-fix bug: `create-acl.tsx` used `useRef(2)` for the new-rule id counter. On edit-load,
 * `processResourceAcls` assigns rule ids 0, 1, 2, ... When the user clicked "Add rule",
 * the new rule got id=2 and collided with an already-loaded rule's React key, causing
 * list-reconciliation state bleed that dropped ACLs on save.
 *
 * Reproducing the collision requires at least 3 distinct rule groups on edit-load
 * (so that id=2 is already taken). The form groups ACLs by (resourceType, pattern, name),
 * so three separate rule groups = three different (resourceType/name) combinations.
 */
import { test } from '@playwright/test';

import {
  ModeCustom,
  OperationTypeAllow,
  ResourcePatternTypeLiteral,
  ResourceTypeCluster,
  ResourceTypeConsumerGroup,
  ResourceTypeTopic,
  ResourceTypeTransactionalId,
  type Rule,
} from '../../../src/components/pages/security/shared/acl-model';
import { AclPage } from '../utils/acl-page';

const initialRules: Rule[] = [
  {
    id: 0,
    resourceType: ResourceTypeCluster,
    mode: ModeCustom,
    selectorType: ResourcePatternTypeLiteral,
    selectorValue: 'kafka-cluster',
    operations: {
      DESCRIBE: OperationTypeAllow,
    },
  },
  {
    id: 1,
    resourceType: ResourceTypeTopic,
    mode: ModeCustom,
    selectorType: ResourcePatternTypeLiteral,
    selectorValue: 'topic-acl2',
    operations: {
      DESCRIBE: OperationTypeAllow,
      READ: OperationTypeAllow,
      WRITE: OperationTypeAllow,
    },
  },
  {
    id: 2,
    resourceType: ResourceTypeConsumerGroup,
    mode: ModeCustom,
    selectorType: ResourcePatternTypeLiteral,
    selectorValue: 'cg-a',
    operations: {
      READ: OperationTypeAllow,
    },
  },
];

const addedRule: Rule = {
  id: 3,
  resourceType: ResourceTypeTransactionalId,
  mode: ModeCustom,
  selectorType: ResourcePatternTypeLiteral,
  selectorValue: 'tx-1',
  operations: {
    DESCRIBE: OperationTypeAllow,
  },
};

test.describe('ACL edit preserves existing rules (UX-1217)', () => {
  test('adding a rule on edit does not wipe existing ACLs', async ({ page }) => {
    test.setTimeout(180_000);

    const principal = `edit-preserve-${Date.now()}`;
    const host = '*';
    const aclPage = new AclPage(page);

    await test.step('Create initial ACL with 3 distinct rule groups', async () => {
      await aclPage.goto();
      await aclPage.setPrincipal(principal);
      await aclPage.setHost(host);
      await aclPage.configureRules(initialRules);
      await aclPage.submitForm();
      await aclPage.waitForDetailPage();
      await aclPage.validateRulesCount(initialRules.length);
    });

    await test.step('Navigate to edit page', async () => {
      await aclPage.clickUpdateButtonFromDetailPage();
      await aclPage.waitForUpdatePage();
    });

    await test.step('Add a new rule — pre-fix this collides with the loaded id=2 rule', async () => {
      await aclPage.updateRules([addedRule]);
      await aclPage.submitForm();
      await aclPage.waitForDetailPage();
    });

    await test.step('Verify every original rule plus the added rule is preserved', async () => {
      const finalRules = [...initialRules, addedRule];
      await aclPage.validateRulesCount(finalRules.length);
      await aclPage.validateAllDetailRules(finalRules, principal, host);
    });
  });
});
