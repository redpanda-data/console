/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { createRouterTransport } from '@connectrpc/connect';
import { describe, expect, onTestFinished, test } from '@rstest/core';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type ListACLsRequest,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { Route as aclDetailsRoute } from 'routes/security/acls/$aclName/details';
import { useUIStateStore } from 'state/ui-state';
import { render, screen } from 'test-utils';

import AclDetailPage from './acl-detail-page';

function aclFixture(principal: string, host: string) {
  return {
    resources: [
      {
        resourceType: ACL_ResourceType.TOPIC,
        resourceName: 'orders',
        resourcePatternType: ACL_ResourcePatternType.LITERAL,
        acls: [{ principal, host, operation: ACL_Operation.READ, permissionType: ACL_PermissionType.ALLOW }],
      },
    ],
  };
}

function renderAcl(aclName: string, host: string) {
  const reads: ListACLsRequest[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(listACLs, (request) => {
      reads.push(request);
      return aclFixture(aclName.includes(':') ? aclName : 'User:alice', host);
    });
  });
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/security/acls/$aclName/details',
    validateSearch: aclDetailsRoute.options.validateSearch,
    component: AclDetailPage,
  });
  const history = createMemoryHistory({ initialEntries: [`/security/acls/${aclName}/details?host=${host}`] });
  const router = createRouter({ history, routeTree: root.addChildren([route]) });
  const previousHeader = useUIStateStore.getState();
  onTestFinished(() => {
    history.destroy();
    useUIStateStore.setState(previousHeader, true);
  });
  render(<RouterProvider router={router} />, { transport });
  return reads;
}

describe('the ACL details route', () => {
  test('reads a Group ACL for its selected host and preserves it in the edit link', async () => {
    const reads = renderAcl('Group:mygroup', '*');

    const edit = await screen.findByRole('button', { name: 'Edit' });
    expect(edit).toHaveAttribute('href', '/security/acls/Group:mygroup/update?host=*');
    expect(screen.getByRole('heading', { name: 'ACL: mygroup' })).toBeVisible();
    expect(reads).toEqual([
      expect.objectContaining({ filter: expect.objectContaining({ principal: 'Group:mygroup', host: '*' }) }),
    ]);
  });

  test.each(['alice', 'User:alice'])('reads the same User ACL for legacy and prefixed URLs: %s', async (aclName) => {
    const reads = renderAcl(aclName, '10.0.0.5');

    expect(await screen.findByRole('heading', { name: 'ACL: alice' })).toBeVisible();
    expect(reads).toEqual([
      expect.objectContaining({ filter: expect.objectContaining({ principal: 'User:alice', host: '10.0.0.5' }) }),
    ]);
  });
});
