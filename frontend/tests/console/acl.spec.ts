import { type Page, test } from '@playwright/test';
import {
  ModeAllowAll,
  ModeCustom,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  ResourcePatternTypeAny,
  ResourcePatternTypeLiteral,
  ResourcePatternTypePrefix,
  ResourceTypeCluster,
  ResourceTypeConsumerGroup,
  ResourceTypeSchemaRegistry,
  ResourceTypeSubject,
  ResourceTypeTopic,
  ResourceTypeTransactionalId,
  type Rule,
} from '../../src/components/pages/acls/new-acl/ACL.model';
import { ACLPage } from './pages/ACLPage';
import { RolePage } from './pages/RolePage';

/**
 * Generates a unique principal name for testing
 */
function generatePrincipalName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const dateStr = `${year}${month}${hour}`;
  const randomStr = Math.random().toString(36).substring(2, 5);
  return `e2e-acl-${dateStr}-${randomStr}`;
}

test.describe('ACL Creation', () => {
  [
    // {
    //   testName: 'should set operations and it should be present in resume component',
    //   principal: generatePrincipalName(),
    //   host: '*',
    //   operation: [
    //     {
    //       id: 0,
    //       resourceType: ResourceTypeCluster,
    //       mode: ModeCustom,
    //       selectorType: ResourcePatternTypeLiteral,
    //       selectorValue: 'kafka-cluster',
    //       operations: {
    //         DESCRIBE: OperationTypeAllow,
    //         CREATE: OperationTypeAllow,
    //         ALTER: OperationTypeDeny,
    //       },
    //     } as Rule,
    //     {
    //       id: 1,
    //       resourceType: ResourceTypeTopic,
    //       mode: ModeCustom,
    //       selectorType: ResourcePatternTypeLiteral,
    //       selectorValue: '*',
    //       operations: {
    //         DESCRIBE: OperationTypeAllow,
    //         CREATE: OperationTypeAllow,
    //         ALTER: OperationTypeAllow,
    //       },
    //     } as Rule,
    //     {
    //       id: 2,
    //       resourceType: ResourceTypeConsumerGroup,
    //       mode: ModeCustom,
    //       selectorType: ResourcePatternTypeLiteral,
    //       selectorValue: '*',
    //       operations: {
    //         DESCRIBE: OperationTypeAllow,
    //         READ: OperationTypeAllow,
    //       },
    //     } as Rule,
    //     {
    //       id: 3,
    //       resourceType: ResourceTypeTransactionalId,
    //       mode: ModeCustom,
    //       selectorType: ResourcePatternTypeLiteral,
    //       selectorValue: '*',
    //       operations: {
    //         DESCRIBE: OperationTypeAllow,
    //       },
    //     } as Rule,
    //     {
    //       id: 4,
    //       resourceType: ResourceTypeSubject,
    //       mode: ModeCustom,
    //       selectorType: ResourcePatternTypeLiteral,
    //       selectorValue: '*',
    //       operations: {
    //         READ: OperationTypeAllow,
    //         WRITE: OperationTypeAllow,
    //       },
    //     } as Rule,
    //     {
    //       id: 5,
    //       resourceType: ResourceTypeSchemaRegistry,
    //       mode: ModeCustom,
    //       selectorType: ResourcePatternTypeLiteral,
    //       selectorValue: '*',
    //       operations: {
    //         DESCRIBE: OperationTypeAllow,
    //         READ: OperationTypeAllow,
    //       },
    //     } as Rule,
    //   ],
    // },
    {
      testName: 'should set operations for schema',
      principal: generatePrincipalName(),
      host: '10.0.0.1',
      operation: [
        {
          id: 4,
          resourceType: ResourceTypeSubject,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            READ: OperationTypeAllow,
            WRITE: OperationTypeAllow,
            ALTER_CONFIGS: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeSchemaRegistry,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE_CONFIGS: OperationTypeAllow,
            ALTER_CONFIGS: OperationTypeAllow,
            DESCRIBE: OperationTypeAllow,
          },
        } as Rule,
      ],
    },
  ].map(({ testName, principal, host, operation }) => {
    [
      { type: 'Role', createPage: (page: Page) => new RolePage(page) },
      { type: 'Acl', createPage: (page: Page) => new ACLPage(page) },
    ].map(({ createPage, type }) => {
      test(`${testName} - ${type}`, async ({ page }) => {
        const aclPage = createPage(page);
        await aclPage.goto();

        await test.step('Set principal and host', async () => {
          await aclPage.setPrincipal(principal);
          await aclPage.setHost(host);
        });

        await test.step('Configure all rules', async () => {
          await aclPage.configureRules(operation);
        });

        await test.step('Verify the summary shows the correct operations', async () => {
          await aclPage.validateAllSummaryRules(operation);
        });

        await test.step('Submit the form', async () => {
          await aclPage.submitForm();
        });

        await test.step('Wait for navigation to detail page', async () => {
          await aclPage.waitForDetailPage();
        });

        await test.step('Verify ACL Rules count matches', async () => {
          await aclPage.validateRulesCount(operation.length);
        });

        await test.step('Add small delay for stability', async () => {
          await aclPage.waitForStability(100);
        });

        await test.step('Check the Detail page - verify all rules are present', async () => {
          await aclPage.validateAllDetailRules(operation, principal, host);
        });

        await test.step('Verify shared configuration is present', async () => {
          await aclPage.validateSharedConfig();
        });

        await test.step('Verify the created ACL/role appears in the list using specific test ID', async () => {
          await aclPage.validateListItem(host, principal);
        });
      });
    });
  });
});

test.describe('ACL Update', () => {
  /**
   * Test cases for ACL Update functionality
   * Each test:
   * 1. Creates initial ACL with specific rules
   * 2. Navigate to update page
   * 3. Modifies the rules (add/remove/change)
   * 4. Validates the changes on detail page
   */

  [
    {
      testName: 'should add a new rule to existing ACL',
      principal: generatePrincipalName(),
      host: '*',
      initialRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeAny,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeAny,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      updatedRules: [
        {
          id: 2,
          resourceType: ResourceTypeConsumerGroup,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
            DELETE: OperationTypeDeny,
          },
        } as Rule,
      ],
      expectedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeAny,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeAny,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 2,
          resourceType: ResourceTypeConsumerGroup,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
            DELETE: OperationTypeDeny,
          },
        } as Rule,
      ],
      removedRules: [],
    },
    {
      testName: 'should remove a rule from existing ACL',
      principal: generatePrincipalName(),
      host: '192.168.1.100',
      initialRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
            ALTER: OperationTypeDeny,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 2,
          resourceType: ResourceTypeConsumerGroup,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      updatedRules: [],
      expectedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
            ALTER: OperationTypeDeny,
          },
        } as Rule,
        {
          id: 2,
          resourceType: ResourceTypeConsumerGroup,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      removedRules: [
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
          },
        } as Rule,
      ],
    },
    {
      testName: 'should update rule mode from Custom to Allow All and Deny All',
      principal: generatePrincipalName(),
      host: '*',
      initialRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeDeny,
            ALTER: OperationTypeAllow,
            ALTER_CONFIGS: OperationTypeDeny,
            CLUSTER_ACTION: OperationTypeAllow,
            DESCRIBE_CONFIGS: OperationTypeDeny,
            IDEMPOTENT_WRITE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeDeny,
            WRITE: OperationTypeAllow,
            CREATE: OperationTypeDeny,
            DELETE: OperationTypeAllow,
            ALTER: OperationTypeDeny,
            ALTER_CONFIGS: OperationTypeAllow,
            DESCRIBE_CONFIGS: OperationTypeDeny,
          },
        } as Rule,
      ],
      updatedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeAllowAll,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {},
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeDenyAll,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {},
        } as Rule,
      ],
      expectedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeAllowAll,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            ALL: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeDenyAll,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            ALL: OperationTypeDeny,
          },
        } as Rule,
      ],
      removedRules: [],
    },
    {
      testName: 'should update rule mode from Allow All and Deny All to Custom',
      principal: generatePrincipalName(),
      host: '10.0.0.0',
      initialRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeAllowAll,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {},
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeDenyAll,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {},
        } as Rule,
      ],
      updatedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeDeny,
            ALTER: OperationTypeAllow,
            ALTER_CONFIGS: OperationTypeDeny,
            CLUSTER_ACTION: OperationTypeAllow,
            DESCRIBE_CONFIGS: OperationTypeDeny,
            IDEMPOTENT_WRITE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeDeny,
            WRITE: OperationTypeAllow,
            CREATE: OperationTypeDeny,
            DELETE: OperationTypeAllow,
            ALTER: OperationTypeDeny,
            ALTER_CONFIGS: OperationTypeAllow,
            DESCRIBE_CONFIGS: OperationTypeDeny,
          },
        } as Rule,
      ],
      expectedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeDeny,
            ALTER: OperationTypeAllow,
            ALTER_CONFIGS: OperationTypeDeny,
            CLUSTER_ACTION: OperationTypeAllow,
            DESCRIBE_CONFIGS: OperationTypeDeny,
            IDEMPOTENT_WRITE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeDeny,
            WRITE: OperationTypeAllow,
            CREATE: OperationTypeDeny,
            DELETE: OperationTypeAllow,
            ALTER: OperationTypeDeny,
            ALTER_CONFIGS: OperationTypeAllow,
            DESCRIBE_CONFIGS: OperationTypeDeny,
          },
        } as Rule,
      ],
      removedRules: [],
    },
    {
      testName: 'should modify operations on existing rules',
      principal: generatePrincipalName(),
      host: '*',
      initialRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      updatedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeDeny, // Changed from Allow to Deny
            CREATE: OperationTypeAllow,
            ALTER: OperationTypeAllow, // Added new operation
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeDeny, // Changed from Allow to Deny
            WRITE: OperationTypeAllow, // Added new operation
          },
        } as Rule,
      ],
      expectedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeDeny,
            CREATE: OperationTypeAllow,
            ALTER: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeDeny,
            WRITE: OperationTypeAllow,
          },
        } as Rule,
      ],
      removedRules: [],
    },
    {
      testName: 'should update selectorValue for different resource types and selector patterns',
      principal: generatePrincipalName(),
      host: '172.16.0.0',
      initialRules: [
        {
          id: 0,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'orders-topic',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeConsumerGroup,
          mode: ModeCustom,
          selectorType: ResourcePatternTypePrefix,
          selectorValue: 'analytics-',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      updatedRules: [
        {
          id: 0,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypePrefix,
          selectorValue: 'events-',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
            WRITE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 2,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'user-profile-updates',
          operations: {
            DESCRIBE: OperationTypeAllow,
            WRITE: OperationTypeAllow,
          },
        } as Rule,
      ],
      expectedRules: [
        {
          id: 0,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypePrefix,
          selectorValue: 'events-',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
            WRITE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeConsumerGroup,
          mode: ModeCustom,
          selectorType: ResourcePatternTypePrefix,
          selectorValue: 'analytics-',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 2,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'user-profile-updates',
          operations: {
            DESCRIBE: OperationTypeAllow,
            WRITE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 3,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'orders-topic',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      removedRules: [],
    },
    {
      testName: 'should handle complex update with additions and removals',
      principal: generatePrincipalName(),
      host: '*',
      initialRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypePrefix,
          selectorValue: 'topic-',
          operations: {
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      updatedRules: [
        {
          id: 0,
          resourceType: ResourceTypeConsumerGroup, // Changed resource_type
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeSubject,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            READ: OperationTypeAllow,
            WRITE: OperationTypeDeny,
          },
        } as Rule,
        {
          id: 2,
          resourceType: ResourceTypeSchemaRegistry,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      removedRules: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypePrefix,
          selectorValue: 'topic-',
          operations: {
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      expectedRules: [
        {
          id: 0,
          resourceType: ResourceTypeConsumerGroup,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeSubject,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            READ: OperationTypeAllow,
            WRITE: OperationTypeDeny,
          },
        } as Rule,
        {
          id: 2,
          resourceType: ResourceTypeSchemaRegistry,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
    },
  ].map(({ testName, principal, host, initialRules, updatedRules, expectedRules, removedRules = [] }) => {
    [
      { type: 'Role', createPage: (page: Page) => new RolePage(page) },
      { type: 'Acl', createPage: (page: Page) => new ACLPage(page) },
    ].map(({ createPage, type }) => {
      test(`${testName} - ${type}`, async ({ page }) => {
        const aclPage = createPage(page);
        await aclPage.goto();

        await test.step('Step 1: Create initial ACL', async () => {
          await aclPage.goto();
          await aclPage.setPrincipal(principal);
          await aclPage.setHost(host);
          await aclPage.configureRules(initialRules);
          await aclPage.validateAllSummaryRules(initialRules);
          await aclPage.submitForm();
          await aclPage.waitForDetailPage();
        });

        await test.step('Verify initial ACL was created successfully', async () => {
          await aclPage.validateRulesCount(initialRules.length);
          await aclPage.validateAllDetailRules(initialRules, principal, host);
        });

        await test.step('Step 2: Navigate to update page', async () => {
          await aclPage.clickUpdateButtonFromDetailPage();
          await aclPage.waitForUpdatePage();
        });

        await test.step('Step 3: Validate existing rules are populated in update form', async () => {
          await aclPage.validateAllSummaryRules(initialRules);
        });

        await test.step('Step 4: Update/add rules - updates existing rules or creates new ones', async () => {
          await aclPage.updateRules(updatedRules);
        });

        await test.step('Step 4b: Delete rules that should be removed', async () => {
          await aclPage.deleteRules(removedRules);
        });

        await test.step('Validate the summary shows all expected rules (initial + updated)', async () => {
          await aclPage.validateAllSummaryRules(expectedRules || [...initialRules, ...updatedRules]);
        });

        await test.step('Step 5: Submit the update', async () => {
          await aclPage.submitForm();
          await aclPage.waitForDetailPage();
        });

        await test.step('Step 6: Verify the changes on detail page', async () => {
          const finalRules = expectedRules || [...initialRules, ...updatedRules];
          await aclPage.validateRulesCount(finalRules.length);
        });

        await test.step('Verify all expected rules are present', async () => {
          const finalRules = expectedRules || [...initialRules, ...updatedRules];
          await aclPage.validateAllDetailRules(finalRules, principal, host);
        });

        await test.step('Verify removed rules are not present', async () => {
          for (const removedRule of removedRules) {
            await aclPage.validateRuleNotExists(removedRule, principal, host);
          }
        });

        await test.step('Verify shared configuration is still present', async () => {
          await aclPage.validateSharedConfig();
        });

        await test.step('Verify the created ACL/role appears in the list using specific test ID', async () => {
          await aclPage.validateListItem(host, principal);
        });
      });
    });
  });
});

test.describe('ACL Disable Rules Validation', () => {
  test('check disable rules', async ({ page }) => {
    const principal = generatePrincipalName();
    const host = '*';
    const rules: Rule[] = [
      {
        id: 0,
        resourceType: ResourceTypeCluster,
        mode: ModeCustom,
        selectorType: ResourcePatternTypeLiteral,
        selectorValue: 'kafka-cluster',
        operations: {
          DESCRIBE: OperationTypeAllow,
          CREATE: OperationTypeAllow,
        },
      } as Rule,
      {
        id: 1,
        resourceType: ResourceTypeSchemaRegistry,
        mode: ModeCustom,
        selectorType: ResourcePatternTypeLiteral,
        selectorValue: '*',
        operations: {
          DESCRIBE: OperationTypeAllow,
          READ: OperationTypeAllow,
        },
      } as Rule,
    ];

    const aclPage = new ACLPage(page);
    await aclPage.goto();

    await test.step('Set principal and host', async () => {
      await aclPage.setPrincipal(principal);
      await aclPage.setHost(host);
    });

    await test.step('Configure the first two rules (cluster and schema registry)', async () => {
      await aclPage.configureRules(rules);
    });

    await test.step('Add a third rule to test disabled buttons', async () => {
      await aclPage.addNewRule();
    });

    await test.step('Validate that cluster and schema registry buttons are disabled for the new rule (index 2)', async () => {
      await aclPage.validateResourceTypeButtonDisabled(2, 'cluster');
      await aclPage.validateResourceTypeButtonDisabled(2, 'schemaRegistry');
    });

    await test.step('Select a different resource type for the third rule (topic should be available)', async () => {
      const newRule = {
        id: 2,
        resourceType: ResourceTypeTopic,
        mode: ModeCustom,
        selectorType: ResourcePatternTypeLiteral,
        selectorValue: '*',
        operations: {
          DESCRIBE: OperationTypeAllow,
          READ: OperationTypeAllow,
        },
      } as Rule;
      await aclPage.selectResourceType(2, newRule);
      await aclPage.configureRule(2, newRule);
    });

    await test.step('Validate the summary shows all configured rules', async () => {
      const newRule = {
        id: 2,
        resourceType: ResourceTypeTopic,
        mode: ModeCustom,
        selectorType: ResourcePatternTypeLiteral,
        selectorValue: '*',
        operations: {
          DESCRIBE: OperationTypeAllow,
          READ: OperationTypeAllow,
        },
      } as Rule;
      await aclPage.validateAllSummaryRules([...rules, newRule]);
    });

    await test.step('Submit the form', async () => {
      await aclPage.submitForm();
    });

    await test.step('Wait for navigation to detail page', async () => {
      await aclPage.waitForDetailPage();
    });

    await test.step('Verify ACL creation was successful', async () => {
      await aclPage.validateRulesCount(3);
      await aclPage.validateSharedConfig();
    });
  });
});

test.describe('Role membership', () => {
  [
    {
      testName: 'should set operations and it should be present in resume component',
      principal: generatePrincipalName(),
      host: '*',
      operation: [
        {
          id: 1,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
            ALTER: OperationTypeDeny,
          },
        } as Rule,
        {
          id: 2,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
            ALTER: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 3,
          resourceType: ResourceTypeConsumerGroup,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 4,
          resourceType: ResourceTypeTransactionalId,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 5,
          resourceType: ResourceTypeSubject,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            READ: OperationTypeAllow,
            WRITE: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 6,
          resourceType: ResourceTypeSchemaRegistry,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
      ],
      addMembership: ['test-user-1', 'test-user-2'],
      deleteMembership: ['test-user-1', 'test-user-2'],
    },
  ].map(({ testName, principal, host, operation, addMembership, deleteMembership }) => {
    test(testName, async ({ page }) => {
      const aclPage = new RolePage(page);
      await aclPage.goto();

      await test.step('Set principal and host', async () => {
        await aclPage.setPrincipal(principal);
        await aclPage.setHost(host);
      });

      await test.step('Configure all rules', async () => {
        await aclPage.configureRules(operation);
      });

      await test.step('Submit the form', async () => {
        await aclPage.submitForm();
      });

      await test.step('Wait for navigation to detail page', async () => {
        await aclPage.waitForDetailPage();
      });

      await test.step('Add small delay for stability', async () => {
        await aclPage.waitForStability(100);
      });

      await test.step('Add membership to the role', async () => {
        if (addMembership && addMembership.length > 0) {
          await aclPage.addMembership(addMembership);
        }
      });

      await test.step('Validate member count', async () => {
        if (addMembership && addMembership.length > 0) {
          await aclPage.validateMemberCount(addMembership.length);
        }
      });

      await test.step('Validate each member exists', async () => {
        if (addMembership && addMembership.length > 0) {
          for (const username of addMembership) {
            await aclPage.validateMemberExists(username);
          }
        }
      });

      await test.step('Delete membership from the role', async () => {
        if (deleteMembership && deleteMembership.length > 0) {
          await aclPage.deleteMembership(deleteMembership);
        }
      });

      await test.step('Validate member count after deletion', async () => {
        if (deleteMembership && deleteMembership.length > 0) {
          await aclPage.validateMemberCount(0);
        }
      });

      await test.step('Validate each member is removed', async () => {
        if (deleteMembership && deleteMembership.length > 0) {
          for (const username of deleteMembership) {
            await aclPage.validateMemberNotExists(username);
          }
        }
      });
    });
  });
});

test.describe('Allow all operations', () => {
  [
    {
      testName: 'should set customer operation and then move to all ops allow',
      principal: generatePrincipalName(),
      host: '*',
      operation: [
        {
          id: 0,
          resourceType: ResourceTypeCluster,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: 'kafka-cluster',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
            ALTER: OperationTypeDeny,
          },
        } as Rule,
        {
          id: 1,
          resourceType: ResourceTypeTopic,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            CREATE: OperationTypeAllow,
            ALTER: OperationTypeAllow,
          },
        } as Rule,
        {
          id: 3,
          resourceType: ResourceTypeTransactionalId,
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
          },
        } as Rule,
      ],
    },
  ].map(({ testName, principal, host, operation }) => {
    const allRules: Rule[] = [
      ResourceTypeCluster,
      ResourceTypeTopic,
      ResourceTypeConsumerGroup,
      ResourceTypeTransactionalId,
      ResourceTypeSubject,
      ResourceTypeSchemaRegistry,
    ].map((type, i) => {
      return {
        id: i,
        mode: ModeAllowAll,
        selectorType: ResourcePatternTypeAny,
        selectorValue: '',
        operations: {},
        resourceType: type,
      } as Rule;
    });

    [
      { type: 'Role', createPage: (page: Page) => new RolePage(page) },
      { type: 'Acl', createPage: (page: Page) => new ACLPage(page) },
    ].map(({ createPage, type }) => {
      test(`${testName} - ${type}`, async ({ page }) => {
        const aclPage = createPage(page);
        await aclPage.goto();

        await test.step('Set principal and host', async () => {
          await aclPage.setPrincipal(principal);
          await aclPage.setHost(host);
        });

        await test.step('Configure all rules', async () => {
          await aclPage.configureRules(operation);
        });

        await test.step('Verify the summary shows the correct operations', async () => {
          await aclPage.validateAllSummaryRules(operation);
        });

        await test.step('Click the "Allow All" button', async () => {
          await aclPage.allowAllButton();
        });

        await test.step('Validate the summary shows all operations as Allow All', async () => {
          await aclPage.validateAllSummaryRules(allRules);
        });

        await test.step('Submit the form', async () => {
          await aclPage.submitForm();
        });

        await test.step('Wait for navigation to detail page', async () => {
          await aclPage.waitForDetailPage();
        });

        await test.step('Verify ACL Rules count matches', async () => {
          await aclPage.validateRulesCount(allRules.length);
        });

        await test.step('Add small delay for stability', async () => {
          await aclPage.waitForStability(100);
        });

        await test.step('Check the Detail page - verify all rules are present', async () => {
          await aclPage.validateAllDetailRules(allRules, principal, host);
        });

        await test.step('Verify shared configuration is present', async () => {
          await aclPage.validateSharedConfig();
        });
      });
    });
  });
});
