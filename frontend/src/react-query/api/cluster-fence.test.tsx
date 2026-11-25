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

const flags = rs.hoisted(() => ({ enableClusterFencing: true }));
const host = rs.hoisted(() => ({ embedded: true }));

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    isEmbedded: rs.fn(() => host.embedded),
    isFeatureFlagEnabled: rs.fn((key: string) => key === 'enableClusterFencing' && flags.enableClusterFencing),
    isServerless: rs.fn(() => false),
  };
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
  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
  return renderHook(() => useClusterFenceStatusQuery(), { wrapper });
};

/** Unfenced, no leader while every broker answers unfenced, fenced, then no leader again with brokers that never answer. */
const twoLeaderLosses = () => {
  const unfenced = { state: ClusterFenceState.UNFENCED, revision: 1n };
  const noLeader = () => {
    throw new ConnectError('no controller leader', Code.Unavailable);
  };
  const readController = rs
    .fn<() => typeof fencedStatus>()
    .mockReturnValueOnce(
      create(GetClusterFenceStatusResponseSchema, { fence: unfenced, brokers: [{ nodeId: 1, fence: unfenced }] })
    )
    .mockImplementationOnce(noLeader)
    .mockReturnValueOnce(fencedStatus)
    .mockImplementation(noLeader);
  const readBroker = rs
    .fn<() => GetClusterFenceBrokerStatusResponse | Promise<GetClusterFenceBrokerStatusResponse>>()
    .mockReturnValueOnce(create(GetClusterFenceBrokerStatusResponseSchema, { broker: { nodeId: 1, fence: unfenced } }))
    .mockImplementation(() => new Promise<never>(rs.fn()));
  return createRouterTransport(({ rpc }) => {
    rpc(getClusterFenceStatus, readController);
    rpc(getClusterFenceBrokerStatus, readBroker);
  });
};

const refetchUntil = async (result: ReturnType<typeof renderStatusQuery>['result'], until: () => void) => {
  await act(() => result.current.refetch());
  await waitFor(until);
};

describe('useClusterFenceStatusQuery', () => {
  beforeEach(() => {
    flags.enableClusterFencing = true;
    host.embedded = true;
    useSupportedFeaturesStore.setState({ clusterFence: true });
    useClusterFenceStore.setState({ phase: null });
  });

  test('reads the fence when the flag is on and the backend serves the API', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, () => fencedStatus);
    });

    const { result } = renderStatusQuery(transport);

    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.summary).toMatchObject({ phase: 'fenced', exemptPrincipals: ['shadow-orders'] });
    expect(result.current.brokers).toStrictEqual([
      { nodeId: 1, status: 'confirmed', copy: { phase: 'fenced', revision: 3n }, blocks: true },
    ]);
    expect(result.current.blocking).toBe(true);
    expect(useClusterFenceStore.getState().phase).toBe('fenced');
  });

  test('uses fresh blocking broker copies after a cached unfenced controller loses leadership', async () => {
    const readController = rs
      .fn<() => typeof fencedStatus>()
      .mockReturnValueOnce(
        create(GetClusterFenceStatusResponseSchema, {
          fence: { state: ClusterFenceState.UNFENCED, revision: 1n },
          brokers: [{ nodeId: 1, fence: { state: ClusterFenceState.UNFENCED, revision: 1n } }],
        })
      )
      .mockImplementation(() => {
        throw new ConnectError('no controller leader', Code.Unavailable);
      });
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, readController);
      rpc(getClusterFenceBrokerStatus, () =>
        create(GetClusterFenceBrokerStatusResponseSchema, {
          broker: { nodeId: 1, fence: { state: ClusterFenceState.FENCED, revision: 2n } },
        })
      );
    });
    const { result } = renderStatusQuery(transport);
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.blocking).toBe(false);
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.ownCopies).toStrictEqual([{ nodeId: 1, phase: 'fenced', revision: 2n }]));
    expect(result.current.known).toBe(false);
    expect(result.current.blocking).toBe(true);
  });

  test.each<[string, () => GetClusterFenceBrokerStatusResponse | Promise<GetClusterFenceBrokerStatusResponse>]>([
    /** An executor that never calls resolve or reject. */
    ['still loading', () => new Promise<never>(rs.fn())],
    [
      'failing',
      () => {
        throw new ConnectError('broker unreachable', Code.Unavailable);
      },
    ],
  ])(
    'keeps blocking on a fenced status the controller can no longer confirm while broker copies are %s',
    async (label, brokerStatus) => {
      const readController = rs
        .fn<() => typeof fencedStatus>()
        .mockReturnValueOnce(fencedStatus)
        .mockImplementation(() => {
          throw new ConnectError('no controller leader', Code.Unavailable);
        });
      const transport = createRouterTransport(({ rpc }) => {
        rpc(getClusterFenceStatus, readController);
        rpc(getClusterFenceBrokerStatus, brokerStatus);
      });
      const { result } = renderStatusQuery(transport);
      await waitFor(() => expect(result.current.blocking).toBe(true));
      await act(() => result.current.refetch());
      await waitFor(() => expect(result.current.known).toBe(false));
      if (label === 'failing') {
        await waitFor(() =>
          expect(result.current.ownCopies).toStrictEqual([{ nodeId: 1, errorMessage: 'broker unreachable' }])
        );
      }
      expect(result.current.blocking).toBe(true);
    }
  );

  test('reads broker copies afresh each time the leader goes, never from an earlier time', async () => {
    const { result } = renderStatusQuery(twoLeaderLosses());
    await waitFor(() => expect(result.current.known).toBe(true));
    await refetchUntil(result, () =>
      expect(result.current.ownCopies).toStrictEqual([{ nodeId: 1, phase: 'unfenced', revision: 1n }])
    );
    expect(result.current.blocking).toBe(false);

    await refetchUntil(result, () => expect(result.current.summary.phase).toBe('fenced'));
    await refetchUntil(result, () => expect(result.current.known).toBe(false));
    expect(result.current.ownCopies).toStrictEqual([{ nodeId: 1, errorMessage: undefined }]);
    expect(result.current.blocking).toBe(true);
  });

  test('stops blocking once every broker’s own copy says unfenced, whatever the last status said', async () => {
    const readController = rs
      .fn<() => typeof fencedStatus>()
      .mockReturnValueOnce(fencedStatus)
      .mockImplementation(() => {
        throw new ConnectError('no controller leader', Code.Unavailable);
      });
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, readController);
      rpc(getClusterFenceBrokerStatus, () =>
        create(GetClusterFenceBrokerStatusResponseSchema, {
          broker: { nodeId: 1, fence: { state: ClusterFenceState.UNFENCED, revision: 4n } },
        })
      );
    });
    const { result } = renderStatusQuery(transport);
    await waitFor(() => expect(result.current.blocking).toBe(true));
    await act(() => result.current.refetch());
    await waitFor(() =>
      expect(result.current.ownCopies).toStrictEqual([{ nodeId: 1, phase: 'unfenced', revision: 4n }])
    );
    expect(result.current.blocking).toBe(false);
  });

  test('retains last-known controller presentation after an ordinary refresh failure', async () => {
    const readStatus = rs
      .fn<() => typeof fencedStatus>()
      .mockReturnValueOnce(fencedStatus)
      .mockImplementation(() => {
        throw new ConnectError('temporary failure', Code.Internal);
      });
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, readStatus);
    });
    const { result } = renderStatusQuery(transport);
    await waitFor(() => expect(result.current.known).toBe(true));
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.known).toBe(true);
    expect(result.current.summary.phase).toBe('fenced');
    expect(result.current.blocking).toBe(true);
  });

  test('self-hosted, reads the fence whenever the backend serves the API, with no flag', async () => {
    host.embedded = false;
    flags.enableClusterFencing = false;
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
        flags.enableClusterFencing = false;
      },
    ],
    [
      'self-hosted, the backend doesn’t serve the API',
      () => {
        host.embedded = false;
        useSupportedFeaturesStore.setState({ clusterFence: false });
      },
    ],
    ['the backend doesn’t serve the API', () => useSupportedFeaturesStore.setState({ clusterFence: false })],
  ])('stays idle when %s', async (_label, arrange) => {
    rs.useFakeTimers();
    onTestFinished(() => {
      rs.useRealTimers();
    });
    arrange();
    const handler = rs.fn(() => fencedStatus);
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, handler);
    });

    const { result } = renderStatusQuery(transport);

    expect(result.current.available).toBe(false);
    expect(result.current.known).toBe(false);
    // Run every timer already queued, and the microtasks between them, so a would-be read has a chance to run.
    await rs.runOnlyPendingTimersAsync();
    expect(handler).not.toHaveBeenCalled();
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

    expect(calls).toStrictEqual(['save', 'fence']);
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

    expect(calls).toStrictEqual(['fence']);
    expect(fenceRequests[0]).toMatchObject({ expectedRevision: 4n });
  });

  test('won’t fence when the save came back with someone else’s settings', async () => {
    const { transport, calls } = fenceTransport(savedFence(6, ['someone-else']));
    const result = renderFenceMutation(transport);

    let failure: unknown;
    await act(async () => {
      failure = await result.current
        .mutateAsync({ settings: reviewed, opened: openedAt(4) })
        .catch((error: unknown) => error);
    });

    expect(calls).toStrictEqual(['save']);
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
      await result.current.mutateAsync({ settings: reviewed, opened: openedAt(4) }).catch(() => undefined);
    });

    expect(calls).toStrictEqual(['save', 'fence']);
    expect(result.current.savedFence).toMatchObject({ revision: 5n, exemptPrincipals: ['shadow-orders'] });
    act(() => result.current.reset());
    expect(result.current.savedFence).toBeUndefined();
  });
});

describe('useClusterFenceStatusQuery when the status can’t be read', () => {
  beforeEach(() => {
    flags.enableClusterFencing = true;
    host.embedded = true;
    useSupportedFeaturesStore.setState({ clusterFence: true });
  });

  const intervalOf = (queryClient: ReturnType<typeof connectQueryWrapper>['queryClient']) => {
    const query = queryClient
      .getQueryCache()
      .getAll()
      .find((candidate) => JSON.stringify(candidate.queryKey).includes('GetClusterFenceStatus'));
    const interval = query?.observers[0]?.options.refetchInterval;
    return query !== undefined && typeof interval === 'function' ? interval(query) : interval;
  };

  const renderFailingStatus = (error: ConnectError) => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getClusterFenceStatus, () => {
        throw error;
      });
    });
    const { wrapper, queryClient } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    return { result: renderHook(() => useClusterFenceStatusQuery(), { wrapper }).result, queryClient };
  };

  test('a viewer without permission stops polling, and the status says why rather than vanishing', async () => {
    const { result, queryClient } = renderFailingStatus(new ConnectError('denied', Code.PermissionDenied));

    await waitFor(() => expect(result.current.access).toBe('forbidden'));
    expect(result.current.available).toBe(true);
    expect(result.current.known).toBe(false);
    expect(intervalOf(queryClient)).toBe(false);
  });

  test.each([
    ['without the API', new ConnectError('no such service', Code.Unimplemented)],
    ['without the endpoint', new ConnectError('not found', Code.NotFound)],
    ['where fencing isn’t active on every broker', new ConnectError('feature is not active', Code.FailedPrecondition)],
  ])('a cluster %s has no fencing, and stops asking', async (_label, error) => {
    const { result, queryClient } = renderFailingStatus(error);

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.access).toBe('unsupported');
    expect(result.current.blocking).toBe(false);
    expect(intervalOf(queryClient)).toBe(false);
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

    await waitFor(() =>
      expect(result.current.ownCopies).toStrictEqual([{ nodeId: 1, phase: 'fenced', revision: 18n }])
    );
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
