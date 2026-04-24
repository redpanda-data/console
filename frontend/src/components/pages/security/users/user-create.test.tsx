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

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
    clusterId: 'test-cluster',
    isServerless: false,
  },
  isFeatureFlagEnabled: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next: unknown) => next),
}));

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock generatePassword for deterministic tests
vi.mock('utils/password', () => ({
  generatePassword: vi.fn(() => 'mock-password-1234567890'),
}));

let mockRolesApiEnabled = false;

vi.mock('../../../state/supported-features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../state/supported-features')>();
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
Element.prototype.scrollIntoView = vi.fn();

// ── Component import (after mocks) ──────────────────────────────────────────
import UserCreatePage from './user-create';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTransport(overrides?: {
  listUsersMock?: ReturnType<typeof vi.fn>;
  createUserMock?: ReturnType<typeof vi.fn>;
  updateRoleMembershipMock?: ReturnType<typeof vi.fn>;
  listRolesMock?: ReturnType<typeof vi.fn>;
  listRoleMembersMock?: ReturnType<typeof vi.fn>;
}) {
  const listUsersMock =
    overrides?.listUsersMock ??
    vi.fn().mockReturnValue(
      create(ListUsersResponseSchema, {
        users: [],
        nextPageToken: '',
      })
    );

  const createUserMock = overrides?.createUserMock ?? vi.fn().mockReturnValue(create(CreateUserResponseSchema, {}));

  const updateRoleMembershipMock =
    overrides?.updateRoleMembershipMock ?? vi.fn().mockReturnValue(create(UpdateRoleMembershipResponseSchema, {}));

  const listRolesMock =
    overrides?.listRolesMock ??
    vi.fn().mockReturnValue(
      create(ListRolesResponseSchema, {
        roles: [],
        nextPageToken: '',
      })
    );

  const listRoleMembersMock =
    overrides?.listRoleMembersMock ??
    vi.fn().mockReturnValue(
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UserCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const user = userEvent.setup();
    const { transport, createUserMock, updateRoleMembershipMock } = buildTransport();

    renderWithFileRoutes(<UserCreatePage />, { transport });

    const usernameInput = await screen.findByTestId('create-user-name');
    await user.type(usernameInput, 'test-user');

    await user.click(screen.getByTestId('create-user-submit'));

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
    const user = userEvent.setup();
    const { transport } = buildTransport();

    renderWithFileRoutes(<UserCreatePage />, { transport });

    const usernameInput = await screen.findByTestId('create-user-name');
    await user.type(usernameInput, 'new-user');

    await user.click(screen.getByTestId('create-user-submit'));

    await waitFor(() => {
      expect(screen.getByText('User created')).toBeInTheDocument();
    });
  });

  test('stays on form when createUser fails', async () => {
    const user = userEvent.setup();
    const createUserMock = vi.fn().mockImplementation(() => {
      throw new ConnectError('permission denied', Code.PermissionDenied);
    });
    const { transport } = buildTransport({ createUserMock });

    renderWithFileRoutes(<UserCreatePage />, { transport });

    const usernameInput = await screen.findByTestId('create-user-name');
    await user.type(usernameInput, 'fail-user');

    await user.click(screen.getByTestId('create-user-submit'));

    // Should stay on the form (not navigate to confirmation)
    await waitFor(() => {
      expect(screen.getByTestId('create-user-name')).toBeInTheDocument();
    });
    expect(screen.queryByText('User created')).not.toBeInTheDocument();
  });

  test('calls updateRoleMembership gRPC for each selected role', async () => {
    mockRolesApiEnabled = true;
    const user = userEvent.setup();
    const listRolesMock = vi.fn().mockReturnValue(
      create(ListRolesResponseSchema, {
        roles: [{ name: 'admin' }, { name: 'viewer' }],
        nextPageToken: '',
      })
    );
    const { transport, createUserMock, updateRoleMembershipMock } = buildTransport({ listRolesMock });

    renderWithFileRoutes(<UserCreatePage />, { transport });

    const usernameInput = await screen.findByTestId('create-user-name');
    await user.type(usernameInput, 'role-user');

    // Wait for roles to load and select them
    await waitFor(() => {
      expect(screen.getByText('Assign roles')).toBeInTheDocument();
    });

    // Open the roles selector and pick a role
    const roleSelect = screen.getByText('Select roles...');
    await user.click(roleSelect);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
    await user.click(screen.getByText('admin'));

    await user.click(screen.getByTestId('create-user-submit'));

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
    const user = userEvent.setup();
    const listRolesMock = vi.fn().mockReturnValue(
      create(ListRolesResponseSchema, {
        roles: [{ name: 'admin' }],
        nextPageToken: '',
      })
    );
    const updateRoleMembershipMock = vi.fn().mockImplementation(() => {
      throw new ConnectError('permission denied', Code.PermissionDenied);
    });
    const { transport, createUserMock } = buildTransport({ listRolesMock, updateRoleMembershipMock });

    renderWithFileRoutes(<UserCreatePage />, { transport });

    const usernameInput = await screen.findByTestId('create-user-name');
    await user.type(usernameInput, 'partial-user');

    // Select a role
    await waitFor(() => {
      expect(screen.getByText('Assign roles')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Select roles...'));
    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
    await user.click(screen.getByText('admin'));

    await user.click(screen.getByTestId('create-user-submit'));

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
    const listUsersMock = vi.fn().mockReturnValue(
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
