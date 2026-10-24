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

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ListRoleMembersResponseSchema,
  ListRolesResponseSchema,
  UpdateRoleMembershipResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import {
  listRoleMembers,
  listRoles,
  updateRoleMembership,
} from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import {
  CreateUserResponseSchema,
  ListUsersResponse_UserSchema,
  ListUsersResponseSchema,
  SASLMechanism,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

// ── Mocks ──────────────────────────────────────────────────────────────────────

rs.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
    clusterId: 'test-cluster',
    isServerless: false,
  },
  isFeatureFlagEnabled: rs.fn(() => false),
  addBearerTokenInterceptor: rs.fn((next: unknown) => next),
}));

rs.mock('state/ui-state', () => ({
  setPageHeader: rs.fn(),
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock generatePassword for deterministic tests
rs.mock('utils/password', () => ({
  generatePassword: rs.fn(() => 'mock-password-1234567890'),
}));

let mockRolesApiEnabled = false;

rs.mock('../../../../state/supported-features', () => {
  const actual = rs.requireActual<typeof import('../../../../state/supported-features')>(
    '../../../../state/supported-features'
  );
  return {
    ...actual,
    Features: { ...actual.Features, createUser: true, deleteUser: true, rolesApi: true },
    useSupportedFeaturesStore: <T,>(selector: (s: Record<string, boolean>) => T) =>
      selector({ createUser: true, deleteUser: true, rolesApi: mockRolesApiEnabled, schemaRegistryACLApi: false }),
  };
});

// Polyfills
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = rs.fn();

// ── Component import (after mocks) ──────────────────────────────────────────
import UserCreatePage from './user-create';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTransport(overrides?: {
  listUsersMock?: ReturnType<typeof rs.fn>;
  createUserMock?: ReturnType<typeof rs.fn>;
  updateRoleMembershipMock?: ReturnType<typeof rs.fn>;
  listRolesMock?: ReturnType<typeof rs.fn>;
  listRoleMembersMock?: ReturnType<typeof rs.fn>;
}) {
  const listUsersMock =
    overrides?.listUsersMock ??
    rs.fn().mockReturnValue(
      create(ListUsersResponseSchema, {
        users: [],
        nextPageToken: '',
      })
    );

  const createUserMock = overrides?.createUserMock ?? rs.fn().mockReturnValue(create(CreateUserResponseSchema, {}));

  const updateRoleMembershipMock =
    overrides?.updateRoleMembershipMock ?? rs.fn().mockReturnValue(create(UpdateRoleMembershipResponseSchema, {}));

  const listRolesMock =
    overrides?.listRolesMock ??
    rs.fn().mockReturnValue(
      create(ListRolesResponseSchema, {
        roles: [],
        nextPageToken: '',
      })
    );

  const listRoleMembersMock =
    overrides?.listRoleMembersMock ??
    rs.fn().mockReturnValue(
      create(ListRoleMembersResponseSchema, {
        members: [],
        nextPageToken: '',
      })
    );

  const transport = createRouterTransport(({ rpc }) => {
    rpc(listUsers, listUsersMock);
    rpc(createUser, createUserMock);
    rpc(updateRoleMembership, updateRoleMembershipMock);
    rpc(listRoles, listRolesMock);
    rpc(listRoleMembers, listRoleMembersMock);
  });

  return {
    transport,
    listUsersMock,
    createUserMock,
    updateRoleMembershipMock,
    listRolesMock,
    listRoleMembersMock,
  };
}

type Transport = ReturnType<typeof buildTransport>['transport'];

const listRolesReturning = (...names: string[]) =>
  rs
    .fn()
    .mockReturnValue(create(ListRolesResponseSchema, { roles: names.map((name) => ({ name })), nextPageToken: '' }));

async function selectRole(user: ReturnType<typeof userEvent.setup>, roleName: string) {
  await waitFor(() => {
    expect(screen.getByText('Assign roles')).toBeInTheDocument();
  });
  await user.click(screen.getByText('Select roles...'));
  await waitFor(() => {
    expect(screen.getByText(roleName)).toBeInTheDocument();
  });
  await user.click(screen.getByText(roleName));
}

/** Renders the page, types the username, optionally picks a role, and submits. */
async function fillFormAndSubmit(transport: Transport, { username, role }: { username: string; role?: string }) {
  const user = userEvent.setup();
  renderWithFileRoutes(<UserCreatePage />, { transport });
  await user.type(await screen.findByTestId('create-user-name'), username);
  if (role) {
    await selectRole(user, role);
  }
  await user.click(screen.getByTestId('create-user-submit'));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('the UserCreatePage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mockRolesApiEnabled = false;
  });

  test('create button disabled when username has invalid characters', async () => {
    const { transport } = buildTransport();

    renderWithFileRoutes(<UserCreatePage />, { transport });

    const usernameInput = await screen.findByTestId('create-user-name');
    // Value-only assertion — bypass char-by-char user.type to save ~500ms.
    fireEvent.input(usernameInput, { target: { value: 'user with spaces' } });

    expect(screen.getByTestId('create-user-submit')).toBeDisabled();
  });

  test('calls createUser gRPC on submit without role assignment', async () => {
    const { transport, createUserMock, updateRoleMembershipMock } = buildTransport();

    await fillFormAndSubmit(transport, { username: 'test-user' });

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledTimes(1);
    });

    const call = createUserMock.mock.calls[0][0];
    expect(call.user?.name).toBe('test-user');
    expect(call.user?.password).toBeDefined();
    expect(call.user?.mechanism).toBe(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256);

    // No roles selected, so updateRoleMembership should not be called
    expect(updateRoleMembershipMock).not.toHaveBeenCalled();
  });

  test('shows confirmation screen on success', async () => {
    const { transport } = buildTransport();

    await fillFormAndSubmit(transport, { username: 'new-user' });

    await waitFor(() => {
      expect(screen.getByText('User created')).toBeInTheDocument();
    });
  });

  test('stays on form when createUser fails', async () => {
    const createUserMock = rs.fn().mockImplementation(() => {
      throw new ConnectError('permission denied', Code.PermissionDenied);
    });
    const { transport } = buildTransport({ createUserMock });

    await fillFormAndSubmit(transport, { username: 'fail-user' });

    // Should stay on the form (not navigate to confirmation)
    await waitFor(() => {
      expect(screen.getByTestId('create-user-name')).toBeInTheDocument();
    });
    expect(screen.queryByText('User created')).not.toBeInTheDocument();
  });

  test('calls updateRoleMembership gRPC for each selected role', async () => {
    mockRolesApiEnabled = true;
    const { transport, createUserMock, updateRoleMembershipMock } = buildTransport({
      listRolesMock: listRolesReturning('admin', 'viewer'),
    });

    // Waits for the roles to load, then opens the roles selector and picks one
    await fillFormAndSubmit(transport, { username: 'role-user', role: 'admin' });

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(updateRoleMembershipMock).toHaveBeenCalledTimes(1);
    });

    const membershipCall = updateRoleMembershipMock.mock.calls[0][0];
    expect(membershipCall.roleName).toBe('admin');
    expect(membershipCall.add).toHaveLength(1);
    expect(membershipCall.add[0].principal).toBe('role-user');
  });

  test('shows confirmation even when role assignment fails', async () => {
    mockRolesApiEnabled = true;
    const updateRoleMembershipMock = rs.fn().mockImplementation(() => {
      throw new ConnectError('permission denied', Code.PermissionDenied);
    });
    const { transport, createUserMock } = buildTransport({
      listRolesMock: listRolesReturning('admin'),
      updateRoleMembershipMock,
    });

    await fillFormAndSubmit(transport, { username: 'partial-user', role: 'admin' });

    // User creation succeeds
    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledTimes(1);
    });

    // Role assignment was attempted
    await waitFor(() => {
      expect(updateRoleMembershipMock).toHaveBeenCalledTimes(1);
    });

    // Confirmation screen still shown despite role failure (Promise.allSettled)
    await waitFor(() => {
      expect(screen.getByText('User created')).toBeInTheDocument();
    });
  });

  test('create button disabled when password is too short', async () => {
    const { transport } = buildTransport();

    renderWithFileRoutes(<UserCreatePage />, { transport });

    const usernameInput = await screen.findByTestId('create-user-name');
    // Value-only assertion — bypass char-by-char user.type to save ~500ms.
    fireEvent.input(usernameInput, { target: { value: 'valid-user' } });

    // Replace the password field value with a too-short password (< 4 chars)
    const passwordInput = screen.getByTestId('create-user-password');
    fireEvent.input(passwordInput, { target: { value: 'ab' } });

    expect(screen.getByTestId('create-user-submit')).toBeDisabled();
  });

  test('shows error when username already exists', async () => {
    const user = userEvent.setup();
    const listUsersMock = rs.fn().mockReturnValue(
      create(ListUsersResponseSchema, {
        users: [create(ListUsersResponse_UserSchema, { name: 'bob' })],
        nextPageToken: '',
      })
    );
    const { transport } = buildTransport({ listUsersMock });

    renderWithFileRoutes(<UserCreatePage />, { transport });

    const usernameInput = await screen.findByTestId('create-user-name');
    await user.type(usernameInput, 'bob');

    await waitFor(() => {
      expect(screen.getByText('User already exists')).toBeInTheDocument();
    });

    expect(screen.getByTestId('create-user-submit')).toBeDisabled();
  });
});
