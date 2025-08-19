import { Page, test } from '@playwright/test';
import {
  ResourcePatternTypeAny,
  ResourceTypeSchemaRegistry,
  ResourceTypeSubject,
  ResourceTypeTransactionalId,
  type Rule,
} from '../../src/components/pages/acls/new-acl/ACL.model';
import {
  ModeCustom,
  ModeAllowAll,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  ResourcePatternTypeLiteral,
  ResourcePatternTypePrefix,
  ResourceTypeCluster,
  ResourceTypeConsumerGroup,
  ResourceTypeTopic,
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
    {
      testName: 'should set operations and it should be present in resume component',
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
        // {
        //   id: 4,
        //   resourceType: ResourceTypeSubject,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     READ: OperationTypeAllow,
        //     WRITE: OperationTypeAllow,
        //   },
        // } as Rule,
        // {
        //   id: 5,
        //   resourceType: ResourceTypeSchemaRegistry,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     DESCRIBE: OperationTypeAllow,
        //     READ: OperationTypeAllow,
        //   },
        // } as Rule,
      ],
    },
    {
      testName: 'should set operations for schema',
      principal: generatePrincipalName(),
      host: '10.0.0.1',
      operation: [
        // {
        //   id: 4,
        //   resourceType: ResourceTypeSubject,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     READ: OperationTypeAllow,
        //     WRITE: OperationTypeAllow,
        //     ALTER_CONFIGS: OperationTypeAllow,
        //   },
        // } as Rule,
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

        // Set principal and host
        await aclPage.setPrincipal(principal);
        await aclPage.setHost(host);

        // Configure all rules
        await aclPage.configureRules(operation);

        // Verify the summary shows the correct operations
        await aclPage.validateAllSummaryRules(operation);

        // Submit the form
        await aclPage.submitForm();

        // Wait for navigation to detail page
        await aclPage.waitForDetailPage();

        // Verify ACL Rules count matches
        await aclPage.validateRulesCount(operation.length);

        // Add small delay for stability
        await aclPage.waitForStability(100);

        // Check the Detail page - verify all rules are present
        await aclPage.validateAllDetailRules(operation, principal, host);

        // Verify shared configuration is present
        await aclPage.validateSharedConfig();
      });
    });
  });
});

test.describe('ACL Update', () => {
  /**
   * Test cases for ACL Update functionality
   * Each test:
   * 1. Creates initial ACL with specific rules
   * 2. Navigates to update page
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
          resourceType: ResourceTypeConsumerGroup, // Changed resource type
          mode: ModeCustom,
          selectorType: ResourcePatternTypeLiteral,
          selectorValue: '*',
          operations: {
            DESCRIBE: OperationTypeAllow,
            READ: OperationTypeAllow,
          },
        } as Rule,
        // {
        //   id: 1,
        //   resourceType: ResourceTypeSubject,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     READ: OperationTypeAllow,
        //     WRITE: OperationTypeDeny,
        //   },
        // } as Rule,
        // {
        //   id: 2,
        //   resourceType: ResourceTypeSchemaRegistry,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     DESCRIBE: OperationTypeAllow,
        //     READ: OperationTypeAllow,
        //   },
        // } as Rule,
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
        // {
        //   id: 1,
        //   resourceType: ResourceTypeSubject,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     READ: OperationTypeAllow,
        //     WRITE: OperationTypeDeny,
        //   },
        // } as Rule,
        // {
        //   id: 2,
        //   resourceType: ResourceTypeSchemaRegistry,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     DESCRIBE: OperationTypeAllow,
        //     READ: OperationTypeAllow,
        //   },
        // } as Rule,
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

        // Step 1: Create initial ACL
        await aclPage.goto();
        await aclPage.setPrincipal(principal);
        await aclPage.setHost(host);
        await aclPage.configureRules(initialRules);
        await aclPage.validateAllSummaryRules(initialRules);
        await aclPage.submitForm();
        await aclPage.waitForDetailPage();

        // Verify initial ACL was created successfully
        await aclPage.validateRulesCount(initialRules.length);
        await aclPage.validateAllDetailRules(initialRules, principal, host);

        // Step 2: Navigate to update page
        await aclPage.clickUpdateButtonFromDetailPage();
        await aclPage.waitForUpdatePage();

        // Step 3: Validate existing rules are populated in update form
        await aclPage.validateAllSummaryRules(initialRules);

        // Step 4: Update/add rules - updates existing rules or creates new ones
        await aclPage.updateRules(updatedRules);

        // Step 4b: Delete rules that should be removed
        await aclPage.deleteRules(removedRules);

        // Validate the summary shows all expected rules (initial + updated)
        await aclPage.validateAllSummaryRules(expectedRules || [...initialRules, ...updatedRules]);

        // Step 5: Submit the update
        await aclPage.submitForm();
        await aclPage.waitForDetailPage();

        // Step 6: Verify the changes on detail page
        const finalRules = expectedRules || [...initialRules, ...updatedRules];
        await aclPage.validateRulesCount(finalRules.length);

        // Verify all expected rules are present
        await aclPage.validateAllDetailRules(finalRules, principal, host);

        // Verify removed rules are not present
        for (const removedRule of removedRules) {
          await aclPage.validateRuleNotExists(removedRule, principal, host);
        }

        // Verify shared configuration is still present
        await aclPage.validateSharedConfig();
      });
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
        // {
        //   id: 5,
        //   resourceType: ResourceTypeSubject,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     READ: OperationTypeAllow,
        //     WRITE: OperationTypeAllow,
        //   },
        // } as Rule,
        // {
        //   id: 6,
        //   resourceType: ResourceTypeSchemaRegistry,
        //   mode: ModeCustom,
        //   selectorType: ResourcePatternTypeLiteral,
        //   selectorValue: '*',
        //   operations: {
        //     DESCRIBE: OperationTypeAllow,
        //     READ: OperationTypeAllow,
        //   },
        // } as Rule,
      ],
      addMembership: ['test-user-1', 'test-user-2'],
      deleteMembership: ['test-user-1', 'test-user-2'],
    },
  ].map(({ testName, principal, host, operation, addMembership, deleteMembership }) => {
    test(testName, async ({ page }) => {
      const aclPage = new RolePage(page);
      await aclPage.goto();

      // Set principal and host
      await aclPage.setPrincipal(principal);
      await aclPage.setHost(host);

      // Configure all rules
      await aclPage.configureRules(operation);

      // Submit the form
      await aclPage.submitForm();

      // Wait for navigation to detail page
      await aclPage.waitForDetailPage();

      // Add small delay for stability
      await aclPage.waitForStability(100);

      // Add membership to the role
      if (addMembership && addMembership.length > 0) {
        await aclPage.addMembership(addMembership);

        // Validate member count
        await aclPage.validateMemberCount(addMembership.length);

        // Validate each member exists
        for (const username of addMembership) {
          await aclPage.validateMemberExists(username);
        }
      }

      // Delete membership from the role
      if (deleteMembership && deleteMembership.length > 0) {
        await aclPage.deleteMembership(deleteMembership);

        // Validate member count after deletion
        await aclPage.validateMemberCount(0);

        // Validate each member is removed
        for (const username of deleteMembership) {
          await aclPage.validateMemberNotExists(username);
        }
      }
    });
  });
});
