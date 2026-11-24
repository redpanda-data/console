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

import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { afterEach, describe, expect, test } from '@rstest/core';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UpdateRoleMembershipRequest } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import {
  listRoleMembers,
  listRoles,
  updateRoleMembership,
} from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { type CreateUserRequest, SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { Toaster } from 'sonner';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import UserCreatePage from './user-create';

const INVALID_USERNAME = /username contains invalid characters/iu;
const PERMISSION_DENIED = /permission denied/iu;
const initialRolesApi = useSupportedFeaturesStore.getInitialState().rolesApi;

afterEach(() => {
  useSupportedFeaturesStore.setState({ rolesApi: initialRolesApi });
});

type UserApi = {
  users?: string[];
  roles?: string[];
  createError?: ConnectError;
  membershipError?: ConnectError;
};

function renderCreateUser({ users = [], roles = [], createError, membershipError }: UserApi = {}) {
  const createdUsers: CreateUserRequest[] = [];
  const membershipChanges: UpdateRoleMembershipRequest[] = [];
  useSupportedFeaturesStore.setState({ rolesApi: roles.length > 0 });

  const transport = createRouterTransport(({ rpc }) => {
    rpc(listUsers, () => ({ users: users.map((name) => ({ name })) }));
    rpc(listRoles, () => ({ roles: roles.map((name) => ({ name })) }));
    rpc(listRoleMembers, () => ({ members: [] }));
    rpc(createUser, (request) => {
      createdUsers.push(request);
      if (createError) {
        throw createError;
      }
      return {};
    });
    rpc(updateRoleMembership, (request) => {
      membershipChanges.push(request);
      if (membershipError) {
        throw membershipError;
      }
      return {};
    });
  });

  renderWithFileRoutes(
    <>
      <UserCreatePage />
      <Toaster />
    </>,
    { initialLocation: '/security/users/create', transport }
  );
  return { createdUsers, membershipChanges, user: userEvent.setup() };
}

const submit = () => screen.getByTestId('create-user-submit');

async function enterUsername(username: string) {
  fireEvent.input(await screen.findByTestId('create-user-name'), { target: { value: username } });
}

async function selectRoles(user: ReturnType<typeof userEvent.setup>, role: string, secondRole?: string) {
  await user.click(await screen.findByText('Select roles...'));
  await user.click(await screen.findByText(role));
  if (secondRole) {
    await user.click(await screen.findByText(secondRole));
  }
}

describe('the UserCreatePage', () => {
  test('rejects whitespace in usernames before making a request', async () => {
    const { createdUsers } = renderCreateUser();

    await enterUsername('user with spaces');

    expect(screen.getByText(INVALID_USERNAME)).toBeVisible();
    expect(submit()).toBeDisabled();
    expect(createdUsers).toHaveLength(0);
  });

  test('creates a SCRAM-SHA-256 user and confirms without assigning roles', async () => {
    const { user, createdUsers, membershipChanges } = renderCreateUser();
    await enterUsername('test-user');
    const generatedPassword = screen.getByTestId('create-user-password');

    await user.click(submit());

    expect(await screen.findByText('User created')).toBeVisible();
    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]?.user).toMatchObject({
      name: 'test-user',
      mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
    });
    expect(createdUsers[0]?.user?.password).toBeTruthy();
    expect(generatedPassword).toHaveValue(createdUsers[0]?.user?.password);
    expect(membershipChanges).toHaveLength(0);
  });

  test('reports a rejected create request and leaves the form available to retry', async () => {
    const { user, createdUsers, membershipChanges } = renderCreateUser({
      createError: new ConnectError('permission denied', Code.PermissionDenied),
    });
    await enterUsername('fail-user');
    await user.click(submit());

    expect(await screen.findByText(PERMISSION_DENIED)).toBeVisible();
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(createdUsers).toHaveLength(1);
    expect(membershipChanges).toHaveLength(0);
    expect(screen.getByTestId('create-user-name')).toHaveValue('fail-user');
    expect(screen.queryByText('User created')).not.toBeInTheDocument();
  });

  test('adds the new user to every selected role', async () => {
    const { user, createdUsers, membershipChanges } = renderCreateUser({ roles: ['admin', 'viewer'] });
    await enterUsername('role-user');
    await selectRoles(user, 'admin', 'viewer');

    await user.click(submit());

    expect(await screen.findByText('User created')).toBeVisible();
    expect(createdUsers).toHaveLength(1);
    expect(membershipChanges).toHaveLength(2);
    for (const role of ['admin', 'viewer']) {
      expect(membershipChanges).toContainEqual(
        expect.objectContaining({ roleName: role, add: [expect.objectContaining({ principal: 'role-user' })] })
      );
    }
  });

  test('confirms user creation even if the requested role assignment fails', async () => {
    const { user, createdUsers, membershipChanges } = renderCreateUser({
      roles: ['admin'],
      membershipError: new ConnectError('role assignment denied', Code.PermissionDenied),
    });
    await enterUsername('partial-user');
    await selectRoles(user, 'admin');

    await user.click(submit());

    expect(await screen.findByText('User created')).toBeVisible();
    expect(createdUsers).toHaveLength(1);
    expect(membershipChanges).toHaveLength(1);
    expect(membershipChanges[0]).toMatchObject({ roleName: 'admin', add: [{ principal: 'partial-user' }] });
  });

  test('rejects a password shorter than the minimum before making a request', async () => {
    const { createdUsers } = renderCreateUser();
    await enterUsername('valid-user');

    fireEvent.input(screen.getByTestId('create-user-password'), { target: { value: 'ab' } });

    expect(submit()).toBeDisabled();
    expect(createdUsers).toHaveLength(0);
  });

  test('shows an error and blocks submission when the username already exists', async () => {
    const { createdUsers } = renderCreateUser({ users: ['bob'] });

    await enterUsername('bob');

    expect(await screen.findByText('User already exists')).toBeVisible();
    expect(submit()).toBeDisabled();
    expect(createdUsers).toHaveLength(0);
  });
});
