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
import userEvent from '@testing-library/user-event';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import type { UpdateRoleMembershipRequest } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import {
  listRoleMembers,
  updateRoleMembership,
} from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { useUIStateStore } from 'state/ui-state';
import { render, screen, waitFor } from 'test-utils';

import { RoleDetailPageNew } from './role-detail-page-new';
import { TooltipProvider } from '../../../redpanda-ui/components/tooltip';

function serveRole() {
  const updates: UpdateRoleMembershipRequest[] = [];
  const members: { principal: string }[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(listACLs, () => ({}));
    rpc(listRoleMembers, () => ({ members }));
    rpc(listUsers, () => ({ users: [{ name: 'scram-user' }] }));
    rpc(updateRoleMembership, (request) => {
      updates.push(request);
      members.push(...request.add);
      return {};
    });
  });
  return { updates, transport };
}

function renderPage() {
  const { updates, transport } = serveRole();
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/security/roles/$roleName/details',
    component: RoleDetailPageNew,
  });
  const history = createMemoryHistory({ initialEntries: ['/security/roles/test-role/details'] });
  const router = createRouter({ history, routeTree: root.addChildren([route]) });
  const previousHeader = useUIStateStore.getState();
  onTestFinished(() => {
    history.destroy();
    useUIStateStore.setState(previousHeader, true);
  });
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
    { transport }
  );
  return updates;
}

async function expectAssignment(updates: UpdateRoleMembershipRequest[], principal: string) {
  await waitFor(() =>
    expect(updates).toEqual([
      expect.objectContaining({
        roleName: 'test-role',
        add: [expect.objectContaining({ principal: `User:${principal}` })],
      }),
    ])
  );
  expect(await screen.findByRole('cell', { name: principal })).toBeVisible();
}

describe('role principal assignment', () => {
  test('assigns an OIDC email principal that is absent from the SCRAM user list', async () => {
    const user = userEvent.setup();
    const updates = renderPage();

    await screen.findByText('No principals assigned');
    await user.type(screen.getByRole('combobox'), 'person@email.com');
    await user.click(await screen.findByText('Create "person@email.com"'));

    await expectAssignment(updates, 'person@email.com');
  });

  test('assigns an existing SCRAM user selected from the list', async () => {
    const user = userEvent.setup();
    const updates = renderPage();

    await screen.findByText('No principals assigned');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('scram-user'));

    await expectAssignment(updates, 'scram-user');
  });
});
