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

import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { createQueryOptions } from '@connectrpc/connect-query';
import { afterAll, afterEach, beforeAll, describe, expect, onTestFinished, test } from '@rstest/core';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { getRedpandaInfo } from 'protogen/redpanda/api/console/v1alpha1/cluster_status-ClusterStatusService_connectquery';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type DeleteACLsRequest,
  ListACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { deleteACLs, listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import type { DeleteUserRequest } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { deleteUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { useApiStore } from 'state/backend-api';
import { cleanup, renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

import { PermissionsListTab } from './permissions-list-tab';

const SCRAM_USER = 'scram-admin';
const ACL_ONLY_USER = 'acl-only-user';
const GROUP = 'engineering';
const GROUP_NAME = /engineering/iu;
const USER_DELETE_OPTION = 'Delete (User only)';
const USER_AND_ACLS_DELETE_OPTION = 'Delete (User and ACLs)';
const ACLS_DELETE_OPTION = 'Delete (ACLs only)';
const ACLS_UNAVAILABLE = /ACLs unavailable/iu;
const ACL_DELETE_DENIED = /acl delete denied/iu;
const USER_DELETE_DENIED = /user is still referenced/iu;
const ACLS_DELETE_TITLE = `Delete ACLs for ${GROUP}`;

type AclsReply = MessageInitShape<typeof listACLs.output>;
type DeleteAclsReply = MessageInitShape<typeof deleteACLs.output>;
type DeleteUserReply = MessageInitShape<typeof deleteUser.output>;

const aclList = {
  resources: [
    {
      resourceType: ACL_ResourceType.TOPIC,
      resourceName: 'orders',
      resourcePatternType: ACL_ResourcePatternType.LITERAL,
      acls: [`Group:${GROUP}`, `User:${ACL_ONLY_USER}`].map((principal) => ({
        principal,
        host: '*',
        operation: ACL_Operation.READ,
        permissionType: ACL_PermissionType.ALLOW,
      })),
    },
  ],
} satisfies AclsReply;

const oldAcls = useApiStore.getState().ACLs;
const guardedFetch = globalThis.fetch;
const originalRestFetch = config.fetch;
const legacyAclsUrl = new URL(`${config.restBasePath}/acls`, window.location.href).href;
const server = setupServer(
  http.get(legacyAclsUrl, () => HttpResponse.json({ isAuthorizerEnabled: true, aclResources: [] }))
);

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in Permissions');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  useApiStore.setState({ ACLs: oldAcls });
});

afterAll(() => {
  config.fetch = originalRestFetch;
  server.close();
});

type PermissionsReplies = {
  list?: () => AclsReply;
  removeAcls?: () => DeleteAclsReply | Promise<DeleteAclsReply>;
  removeUser?: () => DeleteUserReply | Promise<DeleteUserReply>;
};

function renderPermissions({
  list = () => aclList,
  removeAcls = () => ({}),
  removeUser = () => ({}),
}: PermissionsReplies = {}) {
  const aclDeletions: DeleteACLsRequest[] = [];
  const userDeletions: DeleteUserRequest[] = [];
  let users = [{ name: SCRAM_USER }];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getRedpandaInfo, () => ({}));
    rpc(listUsers, () => ({ users }));
    rpc(listACLs, list);
    rpc(deleteACLs, (request) => {
      aclDeletions.push(request);
      return removeAcls();
    });
    rpc(deleteUser, async (request) => {
      userDeletions.push(request);
      const reply = await removeUser();
      users = users.filter((user) => user.name !== request.name);
      return reply;
    });
  });
  const { router } = renderWithFileRoutes(
    <NuqsTestingAdapter>
      <PermissionsListTab />
    </NuqsTestingAdapter>,
    { initialLocation: '/security/permissions', transport }
  );
  return { router, transport, aclDeletions, userDeletions, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

function renderAclRecovery() {
  let failed = false;
  const { user, router, transport } = renderPermissions({
    list: () => {
      if (failed) {
        throw new ConnectError('ACLs unavailable', Code.Internal);
      }
      return aclList;
    },
  });
  const query = createQueryOptions(listACLs, create(ListACLsRequestSchema), { transport });
  const setFailureAndRefetch = async (shouldFail: boolean) => {
    failed = shouldFail;
    await act(() => router.options.context.queryClient.refetchQueries({ queryKey: query.queryKey }));
  };
  return { user, setFailureAndRefetch };
}

const groupTrigger = async () =>
  within(await screen.findByTestId(`row-${GROUP}`)).getByRole('button', { name: GROUP_NAME });

async function openActions(user: User, name: string) {
  const row = within(await screen.findByTestId(`row-${name}`));
  await user.click(within(row.getByTestId(`actions-${name}`)).getByRole('button'));
}

async function confirmUserOnlyDelete(user: User) {
  await openActions(user, SCRAM_USER);
  await user.click(screen.getByRole('menuitem', { name: USER_DELETE_OPTION }));
  const dialog = within(await screen.findByRole('dialog', { name: `Delete user ${SCRAM_USER}` }));
  const confirm = dialog.getByRole('button', { name: 'Delete' });
  expect(confirm).toBeDisabled();
  await user.type(dialog.getByPlaceholderText(`Type "${SCRAM_USER}" to confirm`), SCRAM_USER);
  await user.click(confirm);
}

async function openAclsOnlyDelete(user: User) {
  await openActions(user, GROUP);
  await user.click(screen.getByRole('menuitem', { name: ACLS_DELETE_OPTION }));
  return within(await screen.findByRole('dialog', { name: ACLS_DELETE_TITLE })).getByRole('button', {
    name: 'Delete ACLs',
  });
}

const currentDeleteUserDialog = () => screen.queryByRole('dialog', { name: `Delete user ${SCRAM_USER}` });
const currentDeleteAclsDialog = () => screen.queryByRole('dialog', { name: ACLS_DELETE_TITLE });

describe('permission actions for different principals', () => {
  test('offers ACL deletion, but no user deletion, for a group', async () => {
    const { user } = renderPermissions();
    await openActions(user, GROUP);

    expect(screen.getByRole('menuitem', { name: ACLS_DELETE_OPTION })).toBeEnabled();
    expect(screen.queryByRole('menuitem', { name: USER_DELETE_OPTION })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: USER_AND_ACLS_DELETE_OPTION })).not.toBeInTheDocument();
  });

  test.each([
    { name: SCRAM_USER, disabled: false },
    { name: ACL_ONLY_USER, disabled: true },
  ])('only allows user deletion when $name has a SCRAM account', async ({ name, disabled }) => {
    const { user } = renderPermissions();
    await openActions(user, name);

    for (const option of [USER_DELETE_OPTION, USER_AND_ACLS_DELETE_OPTION]) {
      const menuItem = screen.getByRole('menuitem', { name: option });
      if (disabled) {
        expect(menuItem).toHaveAttribute('aria-disabled', 'true');
      } else {
        expect(menuItem).not.toHaveAttribute('aria-disabled', 'true');
      }
    }
    expect(screen.getByRole('menuitem', { name: ACLS_DELETE_OPTION })).toBeEnabled();
  });

  test('keeps the expanded group when a failed ACL refetch recovers', async () => {
    const { user, setFailureAndRefetch } = renderAclRecovery();

    await user.click(await groupTrigger());
    await setFailureAndRefetch(true);
    expect(await screen.findByText(ACLS_UNAVAILABLE)).toBeVisible();

    await setFailureAndRefetch(false);
    expect(await groupTrigger()).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('deleting permissions and users', () => {
  test('keeps the user confirmation open until its user-only RPC settles', async () => {
    const deletion = Promise.withResolvers<DeleteUserReply>();
    onTestFinished(() => deletion.resolve({}));
    const { user, userDeletions, aclDeletions } = renderPermissions({ removeUser: () => deletion.promise });

    await confirmUserOnlyDelete(user);
    expect(currentDeleteUserDialog()).toBeVisible();
    expect(userDeletions).toMatchObject([{ name: SCRAM_USER }]);
    expect(aclDeletions).toHaveLength(0);

    deletion.resolve({});
    await waitFor(() => expect(currentDeleteUserDialog()).not.toBeInTheDocument());
    expect(screen.queryByTestId(`row-${SCRAM_USER}`)).not.toBeInTheDocument();
  });

  test('sends only one ACL delete when confirmation is double-clicked', async () => {
    const deletion = Promise.withResolvers<DeleteAclsReply>();
    onTestFinished(() => deletion.resolve({}));
    const { user, aclDeletions, userDeletions } = renderPermissions({ removeAcls: () => deletion.promise });
    const confirm = await openAclsOnlyDelete(user);

    await user.dblClick(confirm);
    expect(confirm).toBeDisabled();
    expect(aclDeletions).toMatchObject([{ filter: { principal: `Group:${GROUP}` } }]);
    expect(userDeletions).toHaveLength(0);

    deletion.resolve({});
    await waitFor(() => expect(currentDeleteAclsDialog()).not.toBeInTheDocument());
  });

  test('reports a delayed ACL delete failure once and closes the dialog', async () => {
    const deletion = Promise.withResolvers<DeleteAclsReply>();
    onTestFinished(() => deletion.resolve({}));
    const { user, aclDeletions } = renderPermissions({ removeAcls: () => deletion.promise });

    await user.dblClick(await openAclsOnlyDelete(user));
    await waitFor(() => expect(aclDeletions).toHaveLength(1));
    deletion.reject(new ConnectError('acl delete denied', Code.PermissionDenied));

    expect(await screen.findByText(ACL_DELETE_DENIED)).toBeVisible();
    expect(aclDeletions).toHaveLength(1);
    await waitFor(() => expect(currentDeleteAclsDialog()).not.toBeInTheDocument());
  });

  test('reports a failed SCRAM user delete and closes the dialog', async () => {
    const { user, userDeletions } = renderPermissions({
      removeUser: () => {
        throw new ConnectError('user is still referenced', Code.FailedPrecondition);
      },
    });

    await confirmUserOnlyDelete(user);

    expect(await screen.findByText(USER_DELETE_DENIED)).toBeVisible();
    expect(userDeletions).toMatchObject([{ name: SCRAM_USER }]);
    await waitFor(() => expect(currentDeleteUserDialog()).not.toBeInTheDocument());
  });
});
