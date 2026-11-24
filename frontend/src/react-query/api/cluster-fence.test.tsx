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
import { Code, ConnectError, createRouterTransport, type Transport } from '@connectrpc/connect';
import { beforeEach, describe, expect, onTestFinished, rs, test } from '@rstest/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { config } from 'config';
import {
  ClusterFenceState,
  FenceResponseSchema,
  type GetClusterFenceBrokerStatusResponse,
  GetClusterFenceBrokerStatusResponseSchema,
  GetClusterFenceStatusResponseSchema,
  UpdateClusterFenceSettingsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import {
  fence,
  getClusterFenceBrokerStatus,
  getClusterFenceStatus,
  updateClusterFenceSettings,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { connectQueryWrapper } from 'test-utils';

import {
  describeClusterFenceError,
  isStaleRevisionError,
  useClusterFenceStatusQuery,
  useFenceClusterMutation,
} from './cluster-fence';

beforeEach(() => {
  const originalHost = { jwt: config.jwt, isServerless: config.isServerless, featureFlags: config.featureFlags };
  const originalFeatures = useSupportedFeaturesStore.getState();
  const originalFence = useClusterFenceStore.getState();
  config.jwt = 'test-token';
  config.isServerless = false;
  config.featureFlags = { ...config.featureFlags, enableClusterFencing: true };
  useSupportedFeaturesStore.setState({ clusterFence: true });
  useClusterFenceStore.setState({ phase: null });
  onTestFinished(() => {
    Object.assign(config, originalHost);
    useSupportedFeaturesStore.setState(originalFeatures);
    useClusterFenceStore.setState(originalFence);
  });
});

const fencedStatus = create(GetClusterFenceStatusResponseSchema, {
  fence: {
    state: ClusterFenceState.FENCED,
    revision: 3n,
    settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
  },
  brokers: [{ nodeId: 1, fence: { state: ClusterFenceState.FENCED, revision: 3n } }],
});

const renderStatusQuery = (transport: Transport) => {
  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } }, transport);
  return renderHook(() => useClusterFenceStatusQuery(), { wrapper });
};

const unfenced = { state: ClusterFenceState.UNFENCED, revision: 1n };
const unfencedStatus = create(GetClusterFenceStatusResponseSchema, {
  fence: unfenced,
  brokers: [{ nodeId: 1, fence: unfenced }],
});
const noLeader = new ConnectError('no controller leader', Code.Unavailable);

const serveFenceStatus = (
  initialStatus: typeof fencedStatus | ConnectError,
  readBroker?: () => GetClusterFenceBrokerStatusResponse | Promise<GetClusterFenceBrokerStatusResponse>
) => {
  let status = initialStatus;
  let controllerReads = 0;
  const brokerReads: (number | undefined)[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getClusterFenceStatus, () => {
      controllerReads += 1;
      if (status instanceof ConnectError) {
        throw status;
      }
      return status;
    });
    if (readBroker) {
      rpc(getClusterFenceBrokerStatus, ({ nodeId }) => {
        brokerReads.push(nodeId);
        return readBroker();
      });
    }
  });

  return {
    transport,
    controllerReads: () => controllerReads,
    brokerReads,
    publish: (nextStatus: typeof status) => {
      status = nextStatus;
    },
  };
};

const pendingBrokerRead = () => {
  const pending = Promise.withResolvers<GetClusterFenceBrokerStatusResponse>();
  onTestFinished(() => {
    pending.resolve(create(GetClusterFenceBrokerStatusResponseSchema));
  });
  return pending.promise;
};

const brokerAt = (state: ClusterFenceState, revision: bigint) =>
  create(GetClusterFenceBrokerStatusResponseSchema, {
    broker: { nodeId: 1, fence: { state, revision } },
  });

const refetchStatus = async (
  server: ReturnType<typeof serveFenceStatus>,
  result: ReturnType<typeof renderStatusQuery>['result'],
  status: typeof fencedStatus | ConnectError
) => {
  server.publish(status);
  await act(() => result.current.refetch());
};

const installTestClock = () => {
  rs.useFakeTimers();
  onTestFinished(() => {
    rs.useRealTimers();
  });
};

describe('useClusterFenceStatusQuery', () => {
  test('reads and polls the fence when the flag is on and the backend serves the API', async () => {
    installTestClock();
    const server = serveFenceStatus(fencedStatus);
    const { result } = renderStatusQuery(server.transport);

    await act(() => rs.advanceTimersByTimeAsync(1000));
    expect(result.current).toMatchObject({
      known: true,
      blocking: true,
      summary: { phase: 'fenced', exemptPrincipals: ['shadow-orders'] },
      brokers: [{ nodeId: 1, status: 'confirmed', copy: { phase: 'fenced', revision: 3n }, blocks: true }],
    });
    expect(useClusterFenceStore.getState().phase).toBe('fenced');
    expect(server.controllerReads()).toBe(1);

    await act(() => rs.advanceTimersByTimeAsync(15_000));
    expect(server.controllerReads()).toBe(2);
  });

  test('uses fresh blocking broker copies after a cached unfenced controller loses leadership', async () => {
    const server = serveFenceStatus(unfencedStatus, () => brokerAt(ClusterFenceState.FENCED, 2n));
    const { result } = renderStatusQuery(server.transport);
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.blocking).toBe(false);

    await refetchStatus(server, result, noLeader);

    await waitFor(() => expect(result.current.ownCopies).toEqual([{ nodeId: 1, phase: 'fenced', revision: 2n }]));
    expect(result.current.known).toBe(false);
    expect(result.current.blocking).toBe(true);
    expect(server.brokerReads).toEqual([1]);
  });

  test.each([
    ['still loading', undefined],
    ['failing', 'broker unreachable'],
  ] as const)(
    'keeps blocking on a fenced status the controller can no longer confirm while broker copies are %s',
    async (_label, errorMessage) => {
      const pending = pendingBrokerRead();
      const server = serveFenceStatus(fencedStatus, () => {
        if (errorMessage) {
          throw new ConnectError(errorMessage, Code.Unavailable);
        }
        return pending;
      });
      const { result } = renderStatusQuery(server.transport);
      await waitFor(() => expect(result.current.known).toBe(true));
      expect(result.current.blocking).toBe(true);

      await refetchStatus(server, result, noLeader);

      await waitFor(() => {
        expect(server.brokerReads).toEqual([1]);
        expect(result.current.ownCopies).toEqual([{ nodeId: 1, errorMessage }]);
      });
      expect(result.current.known).toBe(false);
      expect(result.current.blocking).toBe(true);
    }
  );

  test('reads broker copies afresh each time the leader goes, never from an earlier time', async () => {
    const brokerResponses = [brokerAt(ClusterFenceState.UNFENCED, 1n), pendingBrokerRead()];
    const server = serveFenceStatus(unfencedStatus, async () => {
      const response = brokerResponses.shift();
      if (!response) {
        throw new ConnectError('Unexpected broker read', Code.Internal);
      }
      return await response;
    });
    const { result } = renderStatusQuery(server.transport);
    await waitFor(() => expect(result.current.known).toBe(true));

    await refetchStatus(server, result, noLeader);
    await waitFor(() =>
      expect(result.current).toMatchObject({
        ownCopies: [{ nodeId: 1, phase: 'unfenced', revision: 1n }],
        blocking: false,
      })
    );

    await refetchStatus(server, result, fencedStatus);
    await waitFor(() => expect(result.current.summary.phase).toBe('fenced'));

    await refetchStatus(server, result, noLeader);
    await waitFor(() => {
      expect(server.brokerReads).toEqual([1, 1]);
      expect(result.current).toMatchObject({ known: false, blocking: true });
      expect(result.current.ownCopies).toEqual([{ nodeId: 1 }]);
    });
  });

  test('stops blocking once every broker’s own copy says unfenced, whatever the last status said', async () => {
    const server = serveFenceStatus(fencedStatus, () => brokerAt(ClusterFenceState.UNFENCED, 4n));
    const { result } = renderStatusQuery(server.transport);
    await waitFor(() => expect(result.current.blocking).toBe(true));

    await refetchStatus(server, result, noLeader);

    await waitFor(() => expect(result.current.ownCopies).toEqual([{ nodeId: 1, phase: 'unfenced', revision: 4n }]));
    expect(result.current.blocking).toBe(false);
  });

  test('retains last-known controller presentation after an ordinary refresh failure', async () => {
    const server = serveFenceStatus(fencedStatus);
    const { result } = renderStatusQuery(server.transport);
    await waitFor(() => expect(result.current.known).toBe(true));

    await refetchStatus(server, result, new ConnectError('temporary failure', Code.Internal));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.known).toBe(true);
    expect(result.current.summary.phase).toBe('fenced');
    expect(result.current.blocking).toBe(true);
  });

  test('self-hosted, reads the fence whenever the backend serves the API, with no flag', async () => {
    config.jwt = undefined;
    config.featureFlags.enableClusterFencing = false;
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, () => fencedStatus);
    });

    const { result } = renderStatusQuery(transport);

    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.available).toBe(true);
  });

  test.each([
    [
      'the host’s flag is off',
      () => {
        config.featureFlags.enableClusterFencing = false;
      },
    ],
    [
      'self-hosted, the backend doesn’t serve the API',
      () => {
        config.jwt = undefined;
        useSupportedFeaturesStore.setState({ clusterFence: false });
      },
    ],
    ['the backend doesn’t serve the API', () => useSupportedFeaturesStore.setState({ clusterFence: false })],
  ])('stays idle when %s', async (_label, arrange) => {
    installTestClock();
    arrange();
    const server = serveFenceStatus(fencedStatus);

    const { result } = renderStatusQuery(server.transport);

    await act(() => rs.advanceTimersByTimeAsync(30_000));
    expect(result.current.available).toBe(false);
    expect(result.current.known).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
    expect(server.controllerReads()).toBe(0);
  });
});

const openedAt = (revision: number) => ({
  phase: 'unfenced' as const,
  revision: BigInt(revision),
  exemptPrincipals: [],
  allowAllReads: false,
});

const savedFence = (revision: number, exemptPrincipals: string[]) =>
  create(UpdateClusterFenceSettingsResponseSchema, {
    fence: {
      state: ClusterFenceState.UNFENCED,
      revision: BigInt(revision),
      settings: { readPolicy: { exemptPrincipals } },
    },
  });

const fenceTransport = (saved: ReturnType<typeof savedFence>, fenceError?: ConnectError) => {
  const calls: string[] = [];
  const saveRequests: unknown[] = [];
  const fenceRequests: unknown[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(updateClusterFenceSettings, (request) => {
      calls.push('save');
      saveRequests.push(request);
      return saved;
    });
    rpc(fence, (request) => {
      calls.push('fence');
      fenceRequests.push(request);
      if (fenceError) {
        throw fenceError;
      }
      return create(FenceResponseSchema, { fence: { state: ClusterFenceState.FENCING, revision: 6n } });
    });
    rpc(getClusterFenceStatus, () => fencedStatus);
  });
  return { transport, calls, saveRequests, fenceRequests };
};

const reviewed = { exemptPrincipals: ['shadow-orders'], allowAllReads: false };

const renderFenceMutation = (transport: Transport) => {
  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
  return renderHook(() => useFenceClusterMutation(), { wrapper }).result;
};

describe('useFenceClusterMutation', () => {
  test('saves changed settings at the opened revision, then fences at the revision the save returned', async () => {
    const { transport, calls, saveRequests, fenceRequests } = fenceTransport(savedFence(5, ['shadow-orders']));
    const result = renderFenceMutation(transport);

    await act(async () => {
      await result.current.mutateAsync({ settings: reviewed, opened: openedAt(4) });
    });

    expect(calls).toEqual(['save', 'fence']);
    expect(saveRequests[0]).toMatchObject({
      expectedRevision: 4n,
      updateMask: { paths: ['read_policy'] },
      settings: {
        readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads: false },
      },
    });
    expect(fenceRequests[0]).toMatchObject({ expectedRevision: 5n });
  });

  test('fences straight away when the settings are already saved', async () => {
    const { transport, calls, fenceRequests } = fenceTransport(savedFence(5, []));
    const result = renderFenceMutation(transport);

    await act(async () => {
      await result.current.mutateAsync({ settings: { ...reviewed, ...openedAt(4) }, opened: openedAt(4) });
    });

    expect(calls).toEqual(['fence']);
    expect(fenceRequests[0]).toMatchObject({ expectedRevision: 4n });
  });

  test('won’t fence when the save came back with someone else’s settings', async () => {
    const { transport, calls } = fenceTransport(savedFence(6, ['someone-else']));
    const result = renderFenceMutation(transport);

    let failure: unknown;
    await act(async () => {
      failure = await result.current.mutateAsync({ settings: reviewed, opened: openedAt(4) }).catch((error) => error);
    });

    expect(calls).toEqual(['save']);
    expect(isStaleRevisionError(failure)).toBe(true);
    expect(result.current.savedFence).toBeUndefined();
  });

  test('when Fence fails after its own save, reports the fence that save left', async () => {
    const { transport, calls } = fenceTransport(
      savedFence(5, ['shadow-orders']),
      new ConnectError('a data migration is still running', Code.FailedPrecondition)
    );
    const result = renderFenceMutation(transport);

    await act(async () => {
      await expect(result.current.mutateAsync({ settings: reviewed, opened: openedAt(4) })).rejects.toMatchObject({
        code: Code.FailedPrecondition,
        rawMessage: 'a data migration is still running',
      });
    });

    expect(calls).toEqual(['save', 'fence']);
    expect(result.current.savedFence).toMatchObject({ revision: 5n, exemptPrincipals: ['shadow-orders'] });
    act(() => result.current.reset());
    expect(result.current.savedFence).toBeUndefined();
  });
});

describe('useClusterFenceStatusQuery when the status can’t be read', () => {
  test.each([
    ['a viewer without permission', new ConnectError('denied', Code.PermissionDenied), 'forbidden', true],
    ['a cluster without the API', new ConnectError('no such service', Code.Unimplemented), 'unsupported', false],
    ['a cluster without the endpoint', new ConnectError('not found', Code.NotFound), 'unsupported', false],
    [
      'a cluster where fencing isn’t active on every broker',
      new ConnectError('feature is not active', Code.FailedPrecondition),
      'unsupported',
      false,
    ],
  ] as const)('stops polling and exposes the access state for %s', async (_label, error, access, available) => {
    installTestClock();
    const server = serveFenceStatus(error);
    const { result } = renderStatusQuery(server.transport);

    await act(() => rs.advanceTimersByTimeAsync(1000));
    expect(result.current).toMatchObject({ access, available, known: false, blocking: false });
    expect(server.controllerReads()).toBe(1);

    await act(() => rs.advanceTimersByTimeAsync(30_000));
    expect(server.controllerReads()).toBe(1);
  });

  test('with no controller leader, asks the broker for its own copy and keeps blocking writes it rejects', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, () => {
        throw new ConnectError('no controller leader', Code.Unavailable);
      });
      rpc(getClusterFenceBrokerStatus, () =>
        create(GetClusterFenceBrokerStatusResponseSchema, {
          broker: { nodeId: 1, fence: { state: ClusterFenceState.FENCED, revision: 18n } },
        })
      );
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useClusterFenceStatusQuery(), { wrapper });

    await waitFor(() => expect(result.current.ownCopies).toEqual([{ nodeId: 1, phase: 'fenced', revision: 18n }]));
    expect(result.current.known).toBe(false);
    expect(result.current.blocking).toBe(true);
  });
});

describe('describeClusterFenceError', () => {
  test.each([
    [
      new ConnectError('Cluster fence revision has changed', Code.FailedPrecondition),
      'Someone else changed the fence since this page read it. Review its current state, then try again.',
    ],
    [
      new ConnectError('Cluster fence cannot start while a shadow link is configured', Code.FailedPrecondition),
      'This cluster has a shadow link that hasn’t failed over, so it’s still a shadow cluster. Fence its source instead, or fail the link over first. Redpanda said: “Cluster fence cannot start while a shadow link is configured”',
    ],
    [
      new ConnectError('something else', Code.FailedPrecondition),
      'Redpanda refused the change. Redpanda said: “something else”',
    ],
    [
      new ConnectError('took too long', Code.DeadlineExceeded),
      'The call took over 5 seconds and may still apply. Check the fence’s state before you try again.',
    ],
    [new ConnectError('bad mask', Code.InvalidArgument), 'Redpanda rejected the request. Redpanda said: “bad mask”'],
  ])('%s', (error, message) => {
    expect(describeClusterFenceError(error)).toBe(message);
  });
});
