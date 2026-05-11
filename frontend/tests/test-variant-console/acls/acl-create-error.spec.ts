/** biome-ignore-all lint/performance/useTopLevelRegex: e2e test */
/**
 * spec: UX-1208 — Phase 1 e2e test coverage (CRITICAL + HIGH)
 * parent epic: UX-1198 — REST-to-Connect RPC migration
 *
 * Previously REST /api/acls returned REST error bodies. Now ACLService.CreateACL uses
 * Connect with InvalidArgument + structured details. Guards field-level error surfacing
 * through formatToastErrorMessageGRPC.
 *
 * Also guards the UI fix in UX-1218: the create page must not navigate to the detail
 * page when the create RPC fails.
 */

import { expect, test } from '@playwright/test';

import {
  ModeCustom,
  OperationTypeAllow,
  ResourcePatternTypeLiteral,
  ResourceTypeCluster,
  type Rule,
} from '../../../src/components/pages/security/shared/acl-model';
import { mockConnectError, mockConnectNetworkFailure, rpcUrl } from '../../shared/connect-mock';
import { AclPage } from '../utils/acl-page';

const ACL_SERVICE = 'redpanda.api.dataplane.v1.ACLService';

const MINIMAL_RULE: Rule = {
  id: 0,
  resourceType: ResourceTypeCluster,
  mode: ModeCustom,
  selectorType: ResourcePatternTypeLiteral,
  selectorValue: 'kafka-cluster',
  operations: {
    DESCRIBE: OperationTypeAllow,
  },
};

test.describe('ACL creation - Connect RPC error handling', () => {
  test('CreateACL INVALID_ARGUMENT surfaces a field-level error', async ({ page }) => {
    await mockConnectError({
      page,
      urlGlob: rpcUrl(ACL_SERVICE, 'CreateACL'),
      code: 'invalid_argument',
      message: 'principal cannot be empty',
    });

    const aclPage = new AclPage(page);
    await aclPage.goto();
    await aclPage.setPrincipal(`err-${Date.now()}`);
    await aclPage.setHost('*');
    await aclPage.configureRules([MINIMAL_RULE]);
    await aclPage.submitFormExpectingError('http-error');

    // Structural: mock fails the create, so page must stay on /create and NOT reach detail.
    await expect(page).toHaveURL(/\/security\/acls\/create/);
  });

  test('CreateACL network timeout keeps user on the form', async ({ page }) => {
    await mockConnectNetworkFailure({
      page,
      urlGlob: rpcUrl(ACL_SERVICE, 'CreateACL'),
      reason: 'timedout',
    });

    const aclPage = new AclPage(page);
    await aclPage.goto();
    await aclPage.setPrincipal(`timeout-${Date.now()}`);
    await aclPage.setHost('*');
    await aclPage.configureRules([MINIMAL_RULE]);
    await aclPage.submitFormExpectingError('network-abort');

    // Structural: URL still /create.
    await expect(page).toHaveURL(/\/security\/acls\/create/);
  });
});
