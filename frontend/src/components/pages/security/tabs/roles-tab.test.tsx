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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { historyPushMock, refreshRoleMembersMock, refreshRolesMock, deleteRoleMutationMock } = vi.hoisted(() => ({
  historyPushMock: vi.fn(),
  refreshRoleMembersMock: vi.fn().mockResolvedValue(undefined),
  refreshRolesMock: vi.fn().mockResolvedValue(undefined),
  deleteRoleMutationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@redpanda-data/ui', () => {
  const Div = ({
    children,
    flexDirection: _flexDirection,
    ...props
  }: {
    children?: ReactNode;
    flexDirection?: unknown;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>;

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
      tooltip: _tooltip,
      ...props
    }: {
      children?: ReactNode;
      isDisabled?: boolean;
      onClick?: () => void;
      tooltip?: unknown;
      [key: string]: unknown;
    }) => (
      <button disabled={isDisabled} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    CloseButton: ({
      children,
      onClick,
      ...props
    }: {
      children?: ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button onClick={onClick} {...props}>
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
      emptyAction,
      emptyText,
    }: {
      columns: Array<{
        cell?: (ctx: { row: { original: Record<string, unknown> } }) => ReactNode;
        header?: ReactNode;
        id: string;
      }>;
      data: Record<string, unknown>[];
      emptyAction?: ReactNode;
      emptyText?: ReactNode;
    }) =>
      data.length > 0 ? (
        <table>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={String(row.name ?? rowIndex)}>
                {columns.map((column) => (
                  <td key={column.id}>{column.cell?.({ row: { original: row } }) ?? null}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>
          <div>{emptyText}</div>
          {emptyAction}
        </div>
      ),
    Flex: Div,
    Icon: () => <span />,
    Link: ({
      as: Component,
      children,
      ...props
    }: {
      as?: ((props: Record<string, unknown>) => ReactNode) | string;
      children?: ReactNode;
      [key: string]: unknown;
    }) =>
      Component && typeof Component !== 'string' ? (
        <Component {...props}>{children}</Component>
      ) : (
        <a {...props}>{children}</a>
      ),
    Menu: Div,
    MenuButton: ({
      children,
      onClick,
      ...props
    }: {
      children?: ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    MenuItem: ({
      children,
      onClick,
      ...props
    }: {
      children?: ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    MenuList: Div,
    redpandaTheme: {},
    redpandaToastOptions: {
      defaultOptions: {},
    },
    SearchField: ({
      placeholderText,
      searchText,
      setSearchText,
      ...props
    }: {
      placeholderText?: string;
      searchText?: string;
      setSearchText?: (value: string) => void;
      [key: string]: unknown;
    }) => (
      <input
        onChange={(e) => setSearchText?.(e.target.value)}
        placeholder={placeholderText}
        value={searchText ?? ''}
        {...props}
      />
    ),
    Skeleton: Div,
    Text: Div,
    Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();

  return {
    ...actual,
    Link: ({
      children,
      params: _params,
      search: _search,
      to,
      ...props
    }: {
      children: ReactNode;
      params?: unknown;
      search?: unknown;
      to?: string;
      [key: string]: unknown;
    }) => (
      <a href={to ?? ''} {...props}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../shared/delete-role-confirm-modal', () => ({
  DeleteRoleConfirmModal: ({
    buttonEl,
    onConfirm,
    roleName,
  }: {
    buttonEl: ReactNode;
    onConfirm: () => Promise<void> | void;
    roleName: string;
  }) => (
    <div>
      {buttonEl}
      <button data-testid={`mock-confirm-delete-${roleName}`} onClick={() => onConfirm()}>
        Confirm delete
      </button>
    </div>
  ),
}));

vi.mock('../../../../components/misc/error-result', () => ({
  default: () => null,
}));

vi.mock('../../../../state/app-global', () => ({
  appGlobal: {
    historyPush: historyPushMock,
    onRefresh: null,
  },
}));

vi.mock('../../../../state/backend-api', () => {
  const store = {
    ACLs: { isAuthorizerEnabled: true },
    userData: {
      canCreateRoles: true,
      canListAcls: true,
      canManageUsers: true,
      canViewPermissionsList: true,
    },
    enterpriseFeaturesUsed: [] as { name: string; enabled: boolean }[],
    serviceAccounts: null as null | { users: string[] },
    isAdminApiConfigured: false,
  };
  return {
    api: {
      ...store,
      refreshClusterOverview: vi.fn().mockResolvedValue(undefined),
      refreshUserData: vi.fn().mockResolvedValue(undefined),
    },
    useApiStoreHook: <T,>(selector: (s: typeof store) => T) => selector(store),
    rolesApi: {
      deleteRole: vi.fn().mockResolvedValue(undefined),
      refreshRoleMembers: refreshRoleMembersMock,
      refreshRoles: refreshRolesMock,
      roleMembers: new Map([['topic reader/qa', [{ name: 'alice', principalType: 'User' }]]]),
      roles: ['topic reader/qa'],
      rolesError: null,
    },
  };
});

vi.mock('../../../../state/supported-features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../state/supported-features')>();

  return {
    ...actual,
    Features: {
      ...actual.Features,
      createUser: true,
      rolesApi: true,
    },
  };
});

vi.mock('../../../license/feature-license-notification', () => ({
  FeatureLicenseNotification: () => null,
}));

vi.mock('../../../misc/null-fallback-boundary', () => ({
  NullFallbackBoundary: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../misc/section', () => ({
  default: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
}));

vi.mock('react-query/api/security', () => ({
  useDeleteRoleMutation: () => ({
    mutateAsync: deleteRoleMutationMock,
  }),
  useListRolesQuery: () => ({
    data: {
      roles: [{ name: 'topic reader/qa' }],
    },
    error: null,
    isError: false,
  }),
}));

import { RolesTab } from './roles-tab';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';

describe('RolesTab role navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('navigates role edit actions to the encoded update route', async () => {
    const user = userEvent.setup();

    render(
      <NuqsTestingAdapter>
        <RolesTab />
      </NuqsTestingAdapter>
    );

    await user.click(await screen.findByLabelText('Edit role topic reader/qa'));

    expect(historyPushMock).toHaveBeenCalledWith('/security/roles/topic%20reader%2Fqa/update');
  });

  test('renders role list from useListRolesQuery', async () => {
    render(
      <NuqsTestingAdapter>
        <RolesTab />
      </NuqsTestingAdapter>
    );

    await expect(screen.findByTestId('role-list-item-topic reader/qa')).resolves.toBeInTheDocument();
  });

  test('delete role calls deleteRoleMutation with correct arguments', async () => {
    const user = userEvent.setup();

    render(
      <NuqsTestingAdapter>
        <RolesTab />
      </NuqsTestingAdapter>
    );

    await user.click(await screen.findByTestId('mock-confirm-delete-topic reader/qa'));

    expect(deleteRoleMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ roleName: 'topic reader/qa', deleteAcls: true })
    );
  });
});
