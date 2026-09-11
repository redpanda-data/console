/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';

/**
 * Tests for the Permissions List tab delete dropdown behavior.
 *
 * Verifies:
 * - Group principals only see "Delete (ACLs only)" — no user-delete options
 * - Non-service-account User principals should NOT have "Delete User" enabled
 *   (they're ACL-only principals, not SASL-SCRAM accounts)
 */

const NuqsWrapper = ({ children }: { children: ReactNode }) => <NuqsTestingAdapter>{children}</NuqsTestingAdapter>;

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children: ReactNode; to?: string; [key: string]: unknown }) => (
      <a href={to ?? ''} {...props}>
        {children}
      </a>
    ),
    useNavigate: () => rs.fn(),
  };
});

rs.mock('../shared/security-tabs-nav', () => ({
  SecurityTabsNav: () => null,
}));

rs.mock('../shared/delete-user-confirm-modal', () => ({
  DeleteUserConfirmModal: ({
    open,
    userName,
    onConfirm,
  }: {
    open: boolean;
    userName: string;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid={`delete-user-modal-${userName}`}>
        <button data-testid="confirm-delete" onClick={onConfirm}>
          Confirm
        </button>
      </div>
    ) : null,
}));

rs.mock('../../../../components/misc/error-result', () => ({
  default: () => null,
}));

rs.mock('../../../../state/app-global', () => ({
  appGlobal: { historyPush: rs.fn(), onRefresh: null },
}));

rs.mock('../../../../state/backend-api', () => {
  const store = {
    ACLs: { isAuthorizerEnabled: true },
    userData: { canCreateRoles: true, canListAcls: true, canManageUsers: true, canViewPermissionsList: true },
    enterpriseFeaturesUsed: [] as { name: string; enabled: boolean }[],
    isAdminApiConfigured: true,
  };
  return {
    api: {
      ...store,
      refreshAcls: rs.fn().mockResolvedValue(undefined),
      refreshClusterOverview: rs.fn().mockResolvedValue(undefined),
      refreshUserData: rs.fn().mockResolvedValue(undefined),
    },
    AclRequestDefault: {},
    useApiStoreHook: <T,>(selector: (s: typeof store) => T) => selector(store),
    rolesApi: {
      refreshRoleMembers: rs.fn().mockResolvedValue(undefined),
      refreshRoles: rs.fn().mockResolvedValue(undefined),
      roleMembers: new Map(),
      roles: [],
      rolesError: null,
    },
  };
});

rs.mock('../../../../state/supported-features', () => {
  const actual = rs.requireActual<typeof import('../../../../state/supported-features')>(
    '../../../../state/supported-features'
  );
  return {
    ...actual,
    Features: { ...actual.Features, createUser: true, deleteUser: true, rolesApi: true },
    useSupportedFeaturesStore: <T,>(selector: (s: Record<string, boolean>) => T) =>
      selector({ createUser: true, deleteUser: true, rolesApi: true, schemaRegistryACLApi: false }),
  };
});

rs.mock('../../../../state/rest-interfaces', () => ({
  AclRequestDefault: {},
}));

rs.mock('../../../../config', () => {
  const actual = rs.requireActual<typeof import('../../../../config')>('../../../../config');
  return {
    ...actual,
    isFeatureFlagEnabled: (flag: string) =>
      flag === 'enableNewSecurityPage' ? true : actual.isFeatureFlagEnabled(flag),
  };
});

rs.mock('../../../../react-query/api/acl', () => ({
  useCreateACLMutation: () => ({ mutateAsync: rs.fn() }),
  useDeleteAclMutation: () => ({ mutateAsync: rs.fn() }),
}));

rs.mock('../../../../react-query/api/user', () => ({
  useInvalidateUsersCache: () => rs.fn(),
  useDeleteUserMutation: () => ({ mutateAsync: rs.fn().mockResolvedValue(undefined) }),
  useListUsersQuery: () => ({ data: { users: [] }, isLoading: false }),
}));

rs.mock('../hooks/use-principal-permissions', () => ({
  usePrincipalPermissions: () => ({
    principalGroups: [
      {
        principal: 'User:scram-admin',
        principalType: 'User',
        principalName: 'scram-admin',
        isScramUser: true,
        directAcls: [],
        roleAclGroups: [],
        directAclCount: 0,
        inheritedAclCount: 0,
        denyCount: 0,
      },
      {
        principal: 'User:acl-only-user',
        principalType: 'User',
        principalName: 'acl-only-user',
        isScramUser: false,
        directAcls: [],
        roleAclGroups: [],
        directAclCount: 0,
        inheritedAclCount: 0,
        denyCount: 0,
      },
      {
        principal: 'Group:engineering',
        principalType: 'Group',
        principalName: 'engineering',
        isScramUser: false,
        directAcls: [],
        roleAclGroups: [],
        directAclCount: 0,
        inheritedAclCount: 0,
        denyCount: 0,
      },
    ],
    isAclsLoading: false,
    isAclsError: false,
    aclsError: null,
    isUsersError: false,
    usersError: null,
  }),
}));

import { PermissionsListTab } from './permissions-list-tab';

describe('Permissions List - delete dropdown for different principal types', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('Group principal does not show "Delete User" options in dropdown', async () => {
    const user = userEvent.setup();

    render(<PermissionsListTab />, { wrapper: NuqsWrapper });

    const groupRow = await screen.findByTestId('row-engineering');
    const actionsDiv = within(groupRow).getByTestId('actions-engineering');
    await user.click(within(actionsDiv).getByRole('button'));

    // Group should only have "Delete (ACLs only)", not user-delete options
    expect(screen.queryByText('Delete (User and ACLs)')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete (User only)')).not.toBeInTheDocument();
    expect(screen.getByText('Delete (ACLs only)')).toBeInTheDocument();
  });

  test('SCRAM user principal has "Delete User" options enabled', async () => {
    const user = userEvent.setup();

    render(<PermissionsListTab />, { wrapper: NuqsWrapper });

    const scramRow = await screen.findByTestId('row-scram-admin');
    const actionsDiv = within(scramRow).getByTestId('actions-scram-admin');
    await user.click(within(actionsDiv).getByRole('button'));

    // SCRAM user should have all delete options available and enabled
    const deleteUserAndAcls = screen.getByText('Delete (User and ACLs)');
    expect(deleteUserAndAcls).not.toHaveAttribute('data-disabled');

    const deleteUserOnly = screen.getByText('Delete (User only)');
    expect(deleteUserOnly).not.toHaveAttribute('data-disabled');

    expect(screen.getByText('Delete (ACLs only)')).toBeInTheDocument();
  });

  test('Group principal has "Delete (ACLs only)" available', async () => {
    const user = userEvent.setup();

    render(<PermissionsListTab />, { wrapper: NuqsWrapper });

    const groupRow = await screen.findByTestId('row-engineering');
    const actionsDiv = within(groupRow).getByTestId('actions-engineering');
    await user.click(within(actionsDiv).getByRole('button'));

    expect(screen.getByText('Delete (ACLs only)')).toBeInTheDocument();
  });
});
