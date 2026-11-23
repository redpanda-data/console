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

import { Operation_State } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/operation_pb';
import {
  type ShadowLinkSchema as ControlplaneShadowLinkSchema,
  ShadowLink_State as ControlplaneState,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import {
  deleteShadowLink as deleteControlplaneLink,
  getShadowLink as getControlplaneLink,
  listShadowLinks as listControlplaneLinks,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/shadow_link-ShadowLinkService_connectquery';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, createConnectRouter, createRouterTransport, type Transport } from '@connectrpc/connect';
import { createFetchHandler } from '@connectrpc/connect/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, onTestFinished, test } from '@rstest/core';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { UnifiedShadowLinkState } from 'components/pages/shadowlinks/model';
import { config } from 'config';
import { http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { deleteShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import {
  failOver,
  getShadowLink,
  listShadowLinkTopics,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';
import { ShadowLinkState, ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { connectQueryWrapper } from 'test-utils';

import {
  useDeleteShadowLinkUnified,
  useEditShadowLink,
  useFailoverShadowLinkMutation,
  useGetShadowLinkUnified,
  useListShadowTopicQuery,
} from './shadowlink';

const name = 'test-shadow-link';
const clusterId = 'sr-456';
const controlplaneId = 'cp-id-456';
const dataplaneId = 'test-uid-123';
const baseUrl = 'https://controlplane.test';
const server = setupServer();
const guardedFetch = globalThis.fetch;

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the shadow link tests');
    },
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

const serveControlplane = (
  embedded: boolean,
  syncOptions?: MessageInitShape<typeof ControlplaneShadowLinkSchema>['schemaRegistrySyncOptions']
) => {
  const originalConfig = { jwt: config.jwt, clusterId: config.clusterId, controlplaneUrl: config.controlplaneUrl };
  Object.assign(config, { jwt: embedded ? 'test-token' : undefined, clusterId, controlplaneUrl: baseUrl });
  onTestFinished(() => {
    Object.assign(config, originalConfig);
  });

  const reads: string[] = [];
  const deletedIds: string[] = [];
  const link = {
    id: controlplaneId,
    name,
    state: ControlplaneState.PAUSED,
    shadowRedpandaId: clusterId,
    createdAt: timestampFromDate(new Date('2025-01-01T00:00:00Z')),
    updatedAt: timestampFromDate(new Date('2025-01-02T00:00:00Z')),
    schemaRegistrySyncOptions: syncOptions,
  };
  const activeLinks = new Map([[link.id, link]]);
  const { handlers } = createConnectRouter()
    .rpc(listControlplaneLinks, ({ filter }, { requestHeader }) => {
      reads.push('list');
      if (requestHeader.get('Authorization') !== 'Bearer test-token') {
        throw new ConnectError('Missing host token', Code.Unauthenticated);
      }
      return {
        shadowLinks: [...activeLinks.values()].filter((item) => item.shadowRedpandaId === filter?.shadowRedpandaId),
      };
    })
    .rpc(getControlplaneLink, ({ id }) => {
      reads.push('get');
      return { shadowLink: activeLinks.get(id) };
    })
    .rpc(deleteControlplaneLink, ({ id }) => {
      deletedIds.push(id);
      if (!activeLinks.delete(id)) {
        throw new ConnectError('Unknown link', Code.NotFound);
      }
      return { operation: { state: Operation_State.COMPLETED } };
    });

  server.use(
    ...handlers.map((handler) => {
      const handle = createFetchHandler(handler);
      return http.post(baseUrl + handler.requestPath, ({ request }) => handle(request));
    })
  );
  return { reads, deletedIds };
};

const shadowLinkWrapper = (transport: Transport) =>
  connectQueryWrapper({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } }, transport).wrapper;

const renderUnified = (readDataplane: 'available' | 'unavailable') => {
  const readNames: string[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getShadowLink, (request) => {
      readNames.push(request.name);
      if (readDataplane === 'unavailable') {
        throw new ConnectError('Dataplane unavailable', Code.Unavailable);
      }
      return {
        shadowLink: {
          name: request.name,
          uid: dataplaneId,
          state: ShadowLinkState.ACTIVE,
          configurations: { clientOptions: { bootstrapServers: ['localhost:9092'] } },
        },
      };
    });
  });
  return {
    ...renderHook(() => useGetShadowLinkUnified({ name }), { wrapper: shadowLinkWrapper(transport) }),
    readNames,
  };
};

describe('useGetShadowLinkUnified', () => {
  test('returns only dataplane data in standalone mode', async () => {
    const { reads } = serveControlplane(false);
    const { result, readNames } = renderUnified('available');

    await waitFor(() => expect(result.current.data?.id).toBe(dataplaneId));
    expect(result.current.data).toMatchObject({ name, state: UnifiedShadowLinkState.ACTIVE });
    expect(result.current.data?.shadowRedpandaId).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(readNames).toEqual([name]);
    expect(reads).toEqual([]);
  });

  test('merges dataplane identity with controlplane state and timestamps in embedded mode', async () => {
    serveControlplane(true);
    const { result, readNames } = renderUnified('available');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.controlplaneError).toBeNull();
    expect(result.current.data).toMatchObject({
      name,
      id: dataplaneId,
      state: UnifiedShadowLinkState.PAUSED,
      shadowRedpandaId: clusterId,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
    });
    expect(result.current.error).toBeNull();
    expect(readNames).toEqual([name]);
  });

  test('falls back to controlplane data but still exposes the dataplane failure in embedded mode', async () => {
    serveControlplane(true);
    const { result, readNames } = renderUnified('unavailable');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.controlplaneError).toBeNull();
    expect(result.current.dataplaneError).toMatchObject({
      code: Code.Unavailable,
      rawMessage: 'Dataplane unavailable',
    });
    expect(result.current.data).toMatchObject({
      name,
      id: controlplaneId,
      state: UnifiedShadowLinkState.PAUSED,
      shadowRedpandaId: clusterId,
    });
    expect(result.current.error).toBeNull();
    expect(readNames).toEqual([name, name]);
  });
});

describe('useEditShadowLink', () => {
  test.each([
    ['api', { case: 'shadowSchemaRegistryApi', value: { sourceUrl: 'https://sr.example.com' } }],
    ['topic', { case: 'shadowSchemaRegistryTopic', value: {} }],
  ] as const)('hydrates %s mode from the controlplane link', async (mode, schemaRegistryShadowingMode) => {
    serveControlplane(true, { schemaRegistryShadowingMode });
    const { result } = renderHook(() => useEditShadowLink(name), {
      wrapper: shadowLinkWrapper(createRouterTransport(() => undefined)),
    });

    await waitFor(() => expect(result.current.hasData).toBe(true));
    expect(result.current.formValues?.schemaRegistry.mode).toBe(mode);
  });
});

async function deleteLink(result: { current: ReturnType<typeof useDeleteShadowLinkUnified> }, force: boolean) {
  const completed = Promise.withResolvers<void>();
  await act(async () => {
    result.current.deleteShadowLink({ force, onSuccess: completed.resolve, onError: completed.reject });
    await completed.promise;
  });
}

describe('useDeleteShadowLinkUnified', () => {
  test.each([
    ['embedded', true],
    ['standalone', false],
  ] as const)('deletes via the correct service in %s mode', async (_mode, embedded) => {
    const { deletedIds } = serveControlplane(embedded);
    const dataplaneDeletes: { name: string; force: boolean }[] = [];
    const transport = createRouterTransport(({ rpc }) => {
      rpc(deleteShadowLink, (request) => {
        dataplaneDeletes.push({ name: request.name, force: request.force });
        return {};
      });
    });
    const { result } = renderHook(() => useDeleteShadowLinkUnified({ name }), {
      wrapper: shadowLinkWrapper(transport),
    });

    expect(result.current.canDelete).toBe(!embedded);
    await waitFor(() => expect(result.current.canDelete).toBe(true));

    await deleteLink(result, !embedded);

    expect(deletedIds).toEqual(embedded ? [controlplaneId] : []);
    expect(dataplaneDeletes).toEqual(embedded ? [] : [{ name, force: true }]);
    await waitFor(() => expect(result.current.canDelete).toBe(!embedded));
  });
});

describe('useFailoverShadowLinkMutation', () => {
  test.each([
    ['refreshes topic state immediately when requested', true, ShadowTopicState.FAILING_OVER, 2],
    ['leaves topic state unchanged by default', false, ShadowTopicState.ACTIVE, 1],
  ] as const)('%s', async (_label, refresh, expectedState, expectedReads) => {
    let topicReads = 0;
    let topicState = ShadowTopicState.ACTIVE;
    const transport = createRouterTransport(({ rpc }) => {
      rpc(listShadowLinkTopics, () => {
        topicReads += 1;
        return { shadowTopics: [{ topicName: 'orders', state: topicState }] };
      });
      rpc(failOver, () => {
        topicState = ShadowTopicState.FAILING_OVER;
        return { name };
      });
    });
    const { result } = renderHook(
      () => ({
        topics: useListShadowTopicQuery({ shadowLinkName: name, pageSize: -1 }),
        failover: useFailoverShadowLinkMutation(refresh ? { refreshTopics: true } : undefined),
      }),
      { wrapper: shadowLinkWrapper(transport) }
    );

    await waitFor(() => expect(result.current.topics.data?.shadowTopics[0]?.state).toBe(ShadowTopicState.ACTIVE));
    await act(() => result.current.failover.mutateAsync({ name }));

    await waitFor(() => expect(result.current.topics.data?.shadowTopics[0]?.state).toBe(expectedState));
    expect(topicReads).toBe(expectedReads);
  });
});
