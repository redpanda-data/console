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

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { beforeEach, describe, expect, test } from '@rstest/core';
import type { InfiniteData } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import {
  type ListRoleMembersResponse,
  ListRoleMembersResponseSchema,
  RoleMembershipSchema,
  SecurityService,
  UpdateRoleMembershipResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { updateRoleMembership } from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { connectQueryWrapper } from 'test-utils';

import { useUpdateRoleMembershipMutation } from './security';

const makeInfiniteData = (principals: string[]) => ({
  pages: [
    create(ListRoleMembersResponseSchema, {
      members: principals.map((p) => create(RoleMembershipSchema, { principal: p })),
    }),
  ],
  pageParams: [undefined],
});

const getCachedPrincipals = (queryClient: ReturnType<typeof connectQueryWrapper>['queryClient']) => {
  const baseKey = createConnectQueryKey({
    schema: SecurityService.method.listRoleMembers,
    cardinality: 'infinite',
  });
  const entries = queryClient.getQueriesData<InfiniteData<ListRoleMembersResponse>>({
    queryKey: baseKey,
    exact: false,
  });
  return entries.flatMap(([, data]) => data?.pages.flatMap((p) => p.members.map((m) => m.principal)) ?? []);
};

/** A transport whose update call stays pending until `unblock` is called, so the cache can be inspected mid-flight. */
const blockedUpdateTransport = () => {
  let unblock!: () => void;
  const blocked = new Promise<void>((res) => {
    unblock = res;
  });

  const transport = createRouterTransport(({ rpc }) => {
    rpc(updateRoleMembership, async () => {
      await blocked;
      return create(UpdateRoleMembershipResponseSchema, {});
    });
  });
  return { transport, unblock };
};

const renderWithSeededMembers = (transport: ReturnType<typeof createRouterTransport>, principals: string[]) => {
  const { wrapper, queryClient } = connectQueryWrapper({}, transport);

  const cacheKey = createConnectQueryKey({
    schema: SecurityService.method.listRoleMembers,
    cardinality: 'infinite',
  });
  queryClient.setQueryData(cacheKey, makeInfiniteData(principals));

  const { result } = renderHook(() => useUpdateRoleMembershipMutation(), { wrapper });
  return { result, queryClient };
};

describe('useUpdateRoleMembershipMutation — optimistic updates', () => {
  beforeEach(() => {});

  test('optimistically adds a member to the list before the API responds', async () => {
    const { transport, unblock } = blockedUpdateTransport();

    const { result, queryClient } = renderWithSeededMembers(transport, ['User:alice']);

    result.current.mutate({
      roleName: 'test-role',
      add: [create(RoleMembershipSchema, { principal: 'User:bob' })],
      remove: [],
      create: false,
    });

    await waitFor(() => {
      expect(getCachedPrincipals(queryClient)).toContain('User:bob');
    });

    // Existing member must still be present
    expect(getCachedPrincipals(queryClient)).toContain('User:alice');

    unblock();
  });

  test('optimistically removes a member from the list before the API responds', async () => {
    const { transport, unblock } = blockedUpdateTransport();
    const { result, queryClient } = renderWithSeededMembers(transport, ['User:alice', 'User:bob']);

    result.current.mutate({
      roleName: 'test-role',
      add: [],
      remove: [create(RoleMembershipSchema, { principal: 'User:alice' })],
      create: false,
    });

    await waitFor(() => {
      expect(getCachedPrincipals(queryClient)).not.toContain('User:alice');
    });

    // bob must remain
    expect(getCachedPrincipals(queryClient)).toContain('User:bob');

    unblock();
  });

  test('preserves the optimistic update after the mutation resolves successfully', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(updateRoleMembership, () => create(UpdateRoleMembershipResponseSchema, {}));
    });

    const { wrapper, queryClient } = connectQueryWrapper({}, transport);

    const cacheKey = createConnectQueryKey({
      schema: SecurityService.method.listRoleMembers,
      cardinality: 'infinite',
    });
    queryClient.setQueryData(cacheKey, makeInfiniteData(['User:alice']));

    const { result } = renderHook(() => useUpdateRoleMembershipMutation(), { wrapper });

    await result.current.mutateAsync({
      roleName: 'test-role',
      add: [create(RoleMembershipSchema, { principal: 'User:bob' })],
      remove: [],
      create: false,
    });

    // After mutation resolves, the optimistic data must still be present
    expect(getCachedPrincipals(queryClient)).toContain('User:bob');
    expect(getCachedPrincipals(queryClient)).toContain('User:alice');
  });

  test('preserves the removal after the delete mutation resolves successfully', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(updateRoleMembership, () => create(UpdateRoleMembershipResponseSchema, {}));
    });

    const { wrapper, queryClient } = connectQueryWrapper({}, transport);

    const cacheKey = createConnectQueryKey({
      schema: SecurityService.method.listRoleMembers,
      cardinality: 'infinite',
    });
    queryClient.setQueryData(cacheKey, makeInfiniteData(['User:alice', 'User:bob']));

    const { result } = renderHook(() => useUpdateRoleMembershipMutation(), { wrapper });

    await result.current.mutateAsync({
      roleName: 'test-role',
      add: [],
      remove: [create(RoleMembershipSchema, { principal: 'User:alice' })],
      create: false,
    });

    // alice must stay gone after the mutation resolves — not brought back by a refetch
    expect(getCachedPrincipals(queryClient)).not.toContain('User:alice');
    expect(getCachedPrincipals(queryClient)).toContain('User:bob');
  });

  test('rolls back the cache to its previous state when the API returns an error', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(updateRoleMembership, () => {
        throw new ConnectError('permission denied', Code.PermissionDenied);
      });
    });

    const { wrapper, queryClient } = connectQueryWrapper(
      { defaultOptions: { mutations: { retry: false } } },
      transport
    );

    const cacheKey = createConnectQueryKey({
      schema: SecurityService.method.listRoleMembers,
      cardinality: 'infinite',
    });
    queryClient.setQueryData(cacheKey, makeInfiniteData(['User:alice']));

    const { result } = renderHook(() => useUpdateRoleMembershipMutation(), { wrapper });

    await result.current
      .mutateAsync({
        roleName: 'test-role',
        add: [create(RoleMembershipSchema, { principal: 'User:bob' })],
        remove: [],
        create: false,
      })
      .catch(() => {});

    // Cache must be rolled back — bob should not be present
    await waitFor(() => {
      expect(getCachedPrincipals(queryClient)).not.toContain('User:bob');
    });

    expect(getCachedPrincipals(queryClient)).toContain('User:alice');
  });
});
