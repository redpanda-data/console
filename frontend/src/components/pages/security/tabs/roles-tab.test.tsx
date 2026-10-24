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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { createStore as createZustandStore } from 'zustand/vanilla';

import { TooltipProvider } from '../../../redpanda-ui/components/tooltip';

const NuqsWrapper = ({ children }: { children: ReactNode }) => (
  <NuqsTestingAdapter>
    <TooltipProvider>{children}</TooltipProvider>
  </NuqsTestingAdapter>
);

const { historyPushMock, refreshRoleMembersMock, refreshRolesMock, deleteRoleMutationMock } = rs.hoisted(() => ({
  historyPushMock: rs.fn(),
  refreshRoleMembersMock: rs.fn().mockResolvedValue(undefined),
  refreshRolesMock: rs.fn().mockResolvedValue(undefined),
  deleteRoleMutationMock: rs.fn().mockResolvedValue(undefined),
}));

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');

  return {
    ...actual,
    Link: MockLink,
    // Real navigate() returns a promise that settles once the route commits.
    useNavigate: () => rs.fn(() => Promise.resolve()),
  };
});

rs.mock('../shared/delete-role-confirm-modal', () => ({
  DeleteRoleConfirmModal: MockDeleteRoleConfirmModal,
}));

rs.mock('../../../../components/misc/error-result', () => ({
  default: () => null,
}));

rs.mock('../../../../state/app-global', () => ({
  appGlobal: {
    historyPush: historyPushMock,
    onRefresh: null,
  },
}));

rs.mock('../../../../state/backend-api', () => {
  const store = {
    ACLs: { isAuthorizerEnabled: true },
    userData: {
      canCreateRoles: true,
      canListAcls: true,
      canManageUsers: true,
      canViewPermissionsList: true,
    },
    enterpriseFeaturesUsed: [] as { name: string; enabled: boolean }[],
    isAdminApiConfigured: false,
  };

  const rolesState = {
    roleMembers: new Map([['topic reader/qa', [{ name: 'alice', principalType: 'User' }]]]),
    roles: ['topic reader/qa'],
    rolesError: null,
  };

  return {
    api: {
      ...store,
      refreshClusterOverview: rs.fn().mockResolvedValue(undefined),
      refreshUserData: rs.fn().mockResolvedValue(undefined),
    },
    useApiStoreHook: <T,>(selector: (s: typeof store) => T) => selector(store),
    rolesApi: {
      deleteRole: rs.fn().mockResolvedValue(undefined),
      refreshRoleMembers: refreshRoleMembersMock,
      refreshRoles: refreshRolesMock,
      ...rolesState,
    },
    useRolesStore: createZustandStore(() => rolesState),
  };
});

rs.mock('../../../../state/supported-features', () => {
  const actual = rs.requireActual<typeof import('../../../../state/supported-features')>(
    '../../../../state/supported-features'
  );

  return {
    ...actual,
    Features: {
      ...actual.Features,
      createUser: true,
      rolesApi: true,
    },
  };
});

rs.mock('../../../license/feature-license-notification', () => ({
  FeatureLicenseNotification: MockFeatureLicenseNotification,
}));

rs.mock('../../../misc/null-fallback-boundary', () => ({
  NullFallbackBoundary: MockNullFallbackBoundary,
}));

rs.mock('../../../misc/section', () => ({
  default: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
}));

rs.mock('../shared/security-tabs-nav', () => ({
  SecurityTabsNav: MockSecurityTabsNav,
}));

rs.mock('react-query/api/security', () => ({
  useCreateRoleMutation: () => ({ mutateAsync: rs.fn().mockResolvedValue(undefined) }),
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

describe('the RolesTab role navigation', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('renders role list from useListRolesQuery', async () => {
    render(<RolesTab />, { wrapper: NuqsWrapper });

    await expect(screen.findByTestId('role-list-item-topic reader/qa')).resolves.toBeInTheDocument();
  });

  test('delete role calls deleteRoleMutation with correct arguments', async () => {
    const user = userEvent.setup();

    render(<RolesTab />, { wrapper: NuqsWrapper });

    await user.click(await screen.findByTestId('mock-confirm-delete-topic reader/qa'));

    expect(deleteRoleMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ roleName: 'topic reader/qa', deleteAcls: true })
    );
  });
});

function MockLink({
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
}) {
  return (
    <a href={to ?? ''} {...props}>
      {children}
    </a>
  );
}

function MockDeleteRoleConfirmModal({
  onConfirm,
  roleName,
}: {
  onConfirm: () => Promise<void> | void;
  roleName: string;
  [key: string]: unknown;
}) {
  return (
    <button data-testid={`mock-confirm-delete-${roleName}`} onClick={() => onConfirm()}>
      Confirm delete
    </button>
  );
}

function MockFeatureLicenseNotification() {
  return null;
}

function MockNullFallbackBoundary({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

function MockSecurityTabsNav() {
  return null;
}
