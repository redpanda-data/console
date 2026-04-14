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

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Tests for the Permissions List tab delete dropdown behavior.
 *
 * Verifies:
 * - Group principals only see "Delete (ACLs only)" — no user-delete options
 * - Non-service-account User principals should NOT have "Delete User" enabled
 *   (they're ACL-only principals, not SASL-SCRAM accounts)
 */

const { listACLsData } = vi.hoisted(() => ({
  listACLsData: {
    // Return a SCRAM user, a non-SCRAM user (ACL-only), and a Group principal
    data: [
      { host: '*', principal: 'User:scram-admin', principalType: 'User', principalName: 'scram-admin', hasAcl: true },
      {
        host: '*',
        principal: 'User:acl-only-user',
        principalType: 'User',
        principalName: 'acl-only-user',
        hasAcl: true,
      },
      { host: '*', principal: 'Group:engineering', principalType: 'Group', principalName: 'engineering', hasAcl: true },
    ],
    error: null,
    isError: false,
    isLoading: false,
  },
}));

vi.mock('@redpanda-data/ui', () => {
  const Div = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );

  return {
    Alert: Div,
    AlertDescription: Div,
    AlertIcon: () => <span />,
    AlertTitle: Div,
    Badge: Div,
    Box: Div,
    Button: ({
      children,
      isDisabled,
      onClick,
      ...props
    }: {
      children?: ReactNode;
      isDisabled?: boolean;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button disabled={isDisabled} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    createStandaloneToast: () => ({
      ToastContainer: () => null,
      toast: vi.fn(),
    }),
    DataTable: ({
      columns,
      data,
      emptyText,
    }: {
      columns: Array<{
        cell?: (ctx: { row: { original: Record<string, unknown> } }) => ReactNode;
        header?: ReactNode;
        id?: string;
      }>;
      data: Record<string, unknown>[];
      emptyText?: ReactNode;
    }) =>
      data.length > 0 ? (
        <table>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr data-testid={`row-${row.name ?? rowIndex}`} key={String(row.name ?? rowIndex)}>
                {columns.map((column, colIndex) => (
                  <td key={column.id ?? colIndex}>{column.cell?.({ row: { original: row } }) ?? null}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>{emptyText}</div>
      ),
    Flex: Div,
    SearchField: ({
      placeholderText,
      searchText,
      setSearchText,
    }: {
      placeholderText?: string;
      searchText?: string;
      setSearchText?: (value: string) => void;
    }) => (
      <input onChange={(e) => setSearchText?.(e.target.value)} placeholder={placeholderText} value={searchText ?? ''} />
    ),
    Skeleton: Div,
    Text: Div,
    Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
    redpandaTheme: {},
    redpandaToastOptions: { defaultOptions: {} },
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children: ReactNode; to?: string; [key: string]: unknown }) => (
      <a href={to ?? ''} {...props}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../shared/delete-user-confirm-modal', () => ({
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

vi.mock('../shared/user-role-tags', () => ({
  UserRoleTags: () => null,
}));

vi.mock('../../../../components/misc/error-result', () => ({
  default: () => null,
}));

vi.mock('../../../../state/app-global', () => ({
  appGlobal: { historyPush: vi.fn(), onRefresh: null },
}));

vi.mock('../../../../state/backend-api', () => {
  const store = {
    ACLs: { isAuthorizerEnabled: true },
    userData: { canCreateRoles: true, canListAcls: true, canManageUsers: true, canViewPermissionsList: true },
    enterpriseFeaturesUsed: [] as { name: string; enabled: boolean }[],
    serviceAccounts: null,
    isAdminApiConfigured: true,
  };
  return {
    api: {
      ...store,
      deleteServiceAccount: vi.fn().mockResolvedValue(undefined),
      refreshAcls: vi.fn().mockResolvedValue(undefined),
      refreshClusterOverview: vi.fn().mockResolvedValue(undefined),
      refreshUserData: vi.fn().mockResolvedValue(undefined),
    },
    AclRequestDefault: {},
    useApiStoreHook: <T,>(selector: (s: typeof store) => T) => selector(store),
    rolesApi: {
      refreshRoleMembers: vi.fn().mockResolvedValue(undefined),
      refreshRoles: vi.fn().mockResolvedValue(undefined),
      roleMembers: new Map(),
      roles: [],
      rolesError: null,
    },
  };
});

vi.mock('../../../../state/supported-features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../state/supported-features')>();
  return {
    ...actual,
    Features: { ...actual.Features, createUser: true, deleteUser: true, rolesApi: true },
    useSupportedFeaturesStore: <T,>(selector: (s: Record<string, boolean>) => T) =>
      selector({ createUser: true, deleteUser: true, rolesApi: true, schemaRegistryACLApi: false }),
  };
});

vi.mock('../../../../state/rest-interfaces', () => ({
  AclRequestDefault: {},
}));

vi.mock('../../../misc/section', () => ({
  default: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
}));

vi.mock('react-query/api/cluster-status', () => ({
  useGetRedpandaInfoQuery: () => ({ data: {}, isSuccess: true }),
}));

vi.mock('react-query/api/user', () => ({
  useInvalidateUsersCache: () => vi.fn(),
  useDeleteUserMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
  // "scram-admin" is a SCRAM user; "acl-only-user" is NOT (only has ACLs)
  useListUsersQuery: () => ({
    data: { users: [{ name: 'scram-admin' }] },
    isLoading: false,
  }),
}));

vi.mock('react-query/api/acl', () => ({
  useDeleteAclMutation: () => ({ mutateAsync: vi.fn() }),
  useListACLAsPrincipalGroups: () => listACLsData,
}));

import { NuqsTestingAdapter } from 'nuqs/adapters/testing';

import { PermissionsListTab } from './permissions-list-tab';

describe('Permissions List - delete dropdown for different principal types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('Group principal does not show "Delete User" options in dropdown', async () => {
    const user = userEvent.setup();

    render(
      <NuqsTestingAdapter>
        <PermissionsListTab />
      </NuqsTestingAdapter>
    );

    const groupRow = await screen.findByTestId('row-engineering');
    const deleteButton = within(groupRow).getByRole('button');
    await user.click(deleteButton);

    // Group should only have "Delete (ACLs only)", not user-delete options
    expect(screen.queryByText('Delete (User and ACLs)')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete (User only)')).not.toBeInTheDocument();
    expect(screen.getByText('Delete (ACLs only)')).toBeInTheDocument();
  });

  test('SCRAM user principal has "Delete User" options enabled', async () => {
    const user = userEvent.setup();

    // "scram-admin" exists in usersData.users — it's a real SCRAM user
    render(
      <NuqsTestingAdapter>
        <PermissionsListTab />
      </NuqsTestingAdapter>
    );

    const scramRow = await screen.findByTestId('row-scram-admin');
    const deleteButton = within(scramRow).getByRole('button');
    await user.click(deleteButton);

    // SCRAM user should have all delete options available and enabled
    const deleteUserAndAcls = screen.getByText('Delete (User and ACLs)');
    expect(deleteUserAndAcls.getAttribute('data-disabled')).toBe('false');

    const deleteUserOnly = screen.getByText('Delete (User only)');
    expect(deleteUserOnly.getAttribute('data-disabled')).toBe('false');

    expect(screen.getByText('Delete (ACLs only)')).toBeInTheDocument();
  });

  test('Group principal has "Delete (ACLs only)" available', async () => {
    const user = userEvent.setup();

    render(
      <NuqsTestingAdapter>
        <PermissionsListTab />
      </NuqsTestingAdapter>
    );

    const groupRow = await screen.findByTestId('row-engineering');
    const deleteButton = within(groupRow).getByRole('button');
    await user.click(deleteButton);

    // Even though user-delete options are hidden, "Delete (ACLs only)" is always available
    expect(screen.getByText('Delete (ACLs only)')).toBeInTheDocument();
  });
});
