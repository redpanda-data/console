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

import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { createQueryOptions } from '@connectrpc/connect-query';
import { describe, expect, test } from '@rstest/core';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getRedpandaInfo } from 'protogen/redpanda/api/console/v1alpha1/cluster_status-ClusterStatusService_connectquery';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  ListACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

import { AclsTab } from './acls-tab';

const SORT_ASC = /Asc/u;
const ACL_ROW_TESTID = /^acl-list-item-/u;
const ACLS_UNAVAILABLE = /ACLs unavailable/iu;
const USER_ONLY = 'Delete (User only)';
const USER_AND_ACLS = 'Delete (User and ACLs)';
const ACLS_ONLY = 'Delete (ACLs only)';
const aclResponse = {
  resources: [
    {
      resourceType: ACL_ResourceType.TOPIC,
      resourceName: 'orders',
      resourcePatternType: ACL_ResourcePatternType.LITERAL,
      acls: [
        ['User:scram-admin', '*'],
        ['User:acl-only', '10.0.0.1'],
        ['Group:engineering', '*'],
        ['Group:shadowed', '10.0.0.9'],
      ].map(([principal, host]) => ({
        principal,
        host,
        operation: ACL_Operation.READ,
        permissionType: ACL_PermissionType.ALLOW,
      })),
    },
  ],
} satisfies MessageInitShape<typeof listACLs.output>;

function renderAcls() {
  let failed = false;
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getRedpandaInfo, () => ({}));
    rpc(listUsers, () => ({ users: [{ name: 'scram-admin' }, { name: 'shadowed' }] }));
    rpc(listACLs, () => {
      if (failed) {
        throw new ConnectError('ACLs unavailable', Code.Internal);
      }
      return aclResponse;
    });
  });
  const { router } = renderWithFileRoutes(<AclsTab />, { initialLocation: '/security/acls', transport });
  const query = createQueryOptions(listACLs, create(ListACLsRequestSchema), { transport });
  const setFailureAndRefetch = async (shouldFail: boolean) => {
    failed = shouldFail;
    await act(() => router.options.context.queryClient.refetchQueries({ queryKey: query.queryKey }));
  };
  return { user: userEvent.setup(), setFailureAndRefetch };
}

type User = ReturnType<typeof userEvent.setup>;

async function openMenu(user: User, name: string) {
  await user.click(await screen.findByRole('button', { name: `Delete ACL for ${name}` }));
  return within(await screen.findByRole('menu'));
}

function assertUserDeleteMenu(menu: ReturnType<typeof within>, disabled: boolean) {
  for (const option of [USER_ONLY, USER_AND_ACLS]) {
    const item = menu.getByRole('menuitem', { name: option });
    if (disabled) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
    } else {
      expect(item).not.toHaveAttribute('aria-disabled', 'true');
    }
  }
  expect(menu.getByRole('menuitem', { name: ACLS_ONLY })).toBeEnabled();
}

describe('the ACL list', () => {
  test('shows ACL principals with their hosts and labels groups', async () => {
    renderAcls();

    expect(await screen.findByTestId('acl-list-item-scram-admin-*')).toBeVisible();
    expect(screen.getByTestId('acl-list-item-acl-only-10.0.0.1')).toBeVisible();
    expect(screen.getByText('10.0.0.1')).toBeVisible();
    expect(screen.getByRole('link', { name: 'engineering Group' })).toBeVisible();
  });

  test('allows deleting the user only for a SCRAM ACL principal', async () => {
    const { user } = renderAcls();
    const menu = await openMenu(user, 'scram-admin');
    await waitFor(() => assertUserDeleteMenu(menu, false));

    await user.keyboard('{Escape}');
    assertUserDeleteMenu(await openMenu(user, 'acl-only'), true);
  });

  test('never offers user deletion for a group that shares an existing SCRAM username', async () => {
    const { user } = renderAcls();
    const menu = await openMenu(user, 'scram-admin');
    await waitFor(() => assertUserDeleteMenu(menu, false));
    await user.keyboard('{Escape}');

    assertUserDeleteMenu(await openMenu(user, 'shadowed'), true);
  });

  test('sorts by the rendered principal names', async () => {
    const { user } = renderAcls();
    await screen.findByTestId('acl-list-item-scram-admin-*');
    await user.click(screen.getByRole('button', { name: 'Principal' }));
    await user.click(await screen.findByRole('menuitem', { name: SORT_ASC }));

    expect(screen.getAllByTestId(ACL_ROW_TESTID).map((item) => item.textContent)).toEqual([
      'acl-only',
      'engineering',
      'scram-admin',
      'shadowed',
    ]);
  });

  test('keeps the principal filter when a failed ACL refetch recovers', async () => {
    const { user, setFailureAndRefetch } = renderAcls();
    await user.type(await screen.findByPlaceholderText('Filter by name'), 'engineering');

    await setFailureAndRefetch(true);
    expect(await screen.findByText(ACLS_UNAVAILABLE)).toBeVisible();

    await setFailureAndRefetch(false);
    expect(await screen.findByPlaceholderText('Filter by name')).toHaveValue('engineering');
    expect(await screen.findByTestId('acl-list-item-engineering-*')).toBeVisible();
    expect(screen.queryByTestId('acl-list-item-scram-admin-*')).not.toBeInTheDocument();
  });
});
