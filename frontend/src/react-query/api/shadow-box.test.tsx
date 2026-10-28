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
  box,
  getShadowBoxBrokerStatus,
  getShadowBoxStatus,
  updateShadowBoxSettings,
} from 'protogen/redpanda/api/console/v1alpha1/shadowbox-ShadowBoxService_connectquery';
import {
  BoxResponseSchema,
  GetShadowBoxBrokerStatusResponseSchema,
  GetShadowBoxStatusResponseSchema,
  ShadowBoxState,
  UpdateShadowBoxSettingsResponseSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_box_pb';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useShadowBoxStore } from 'stores/shadow-box-store';
import { connectQueryWrapper } from 'test-utils';

const flags = rs.hoisted(() => ({ enableShadowBoxing: true }));

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    isFeatureFlagEnabled: rs.fn((key: string) => flags[key as keyof typeof flags] ?? false),
    isServerless: rs.fn(() => false),
  };
});

import {
  describeShadowBoxError,
  isStaleRevisionError,
  useBoxClusterMutation,
  useShadowBoxStatusQuery,
} from './shadow-box';

const boxedStatus = create(GetShadowBoxStatusResponseSchema, {
  box: {
    state: ShadowBoxState.BOXED,
    revision: 3n,
    settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
  },
  brokers: [{ nodeId: 1, box: { state: ShadowBoxState.BOXED, revision: 3n } }],
});

const renderStatusQuery = (transport: Transport) => {
  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
  return renderHook(() => useShadowBoxStatusQuery(), { wrapper });
};

describe('useShadowBoxStatusQuery', () => {
  beforeEach(() => {
    flags.enableShadowBoxing = true;
    useSupportedFeaturesStore.setState({ shadowBoxService: true });
    useShadowBoxStore.setState({ phase: null });
  });

  test('reads the box when the flag is on and the backend serves the API', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowBoxStatus, () => boxedStatus);
    });

    const { result } = renderStatusQuery(transport);

    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.summary).toMatchObject({ phase: 'boxed', exemptPrincipals: ['shadow-orders'] });
    expect(result.current.brokers).toEqual([
      { nodeId: 1, status: 'confirmed', copy: { phase: 'boxed', revision: 3n }, blocks: true },
    ]);
    expect(result.current.blocking).toBe(true);
    expect(useShadowBoxStore.getState().phase).toBe('boxed');
  });

  test.each([
    [
      'the flag is off',
      () => {
        flags.enableShadowBoxing = false;
      },
    ],
    ['the backend doesn’t serve the API', () => useSupportedFeaturesStore.setState({ shadowBoxService: false })],
  ])('stays idle when %s', async (_label, arrange) => {
    rs.useFakeTimers();
    onTestFinished(() => {
      rs.useRealTimers();
    });
    arrange();
    const handler = rs.fn(() => boxedStatus);
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowBoxStatus, handler);
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
  phase: 'unboxed' as const,
  revision: BigInt(revision),
  exemptPrincipals: [],
  allowAllReads: false,
  skipTransactionExpiration: false,
});

const savedBox = (revision: number, exemptPrincipals: string[]) =>
  create(UpdateShadowBoxSettingsResponseSchema, {
    box: {
      state: ShadowBoxState.UNBOXED,
      revision: BigInt(revision),
      settings: { readPolicy: { exemptPrincipals }, skipTransactionExpiration: true },
    },
  });

const boxTransport = (saved: ReturnType<typeof savedBox>, boxError?: ConnectError) => {
  const calls: string[] = [];
  const saveRequests: unknown[] = [];
  const boxRequests: unknown[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(updateShadowBoxSettings, (request) => {
      calls.push('save');
      saveRequests.push(request);
      return saved;
    });
    rpc(box, (request) => {
      calls.push('box');
      boxRequests.push(request);
      if (boxError) {
        throw boxError;
      }
      return create(BoxResponseSchema, { box: { state: ShadowBoxState.BOXING, revision: 6n } });
    });
    rpc(getShadowBoxStatus, () => boxedStatus);
  });
  return { transport, calls, saveRequests, boxRequests };
};

const reviewed = { exemptPrincipals: ['shadow-orders'], allowAllReads: false, skipTransactionExpiration: true };

describe('useBoxClusterMutation', () => {
  test('saves changed settings at the opened revision, then boxes at the revision the save returned', async () => {
    const { transport, calls, saveRequests, boxRequests } = boxTransport(savedBox(5, ['shadow-orders']));
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    const { result } = renderHook(() => useBoxClusterMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ settings: reviewed, opened: openedAt(4) });
    });

    expect(calls).toEqual(['save', 'box']);
    expect(saveRequests[0]).toMatchObject({
      expectedRevision: 4n,
      updateMask: { paths: ['read_policy', 'skip_transaction_expiration'] },
      settings: {
        readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads: false },
        skipTransactionExpiration: true,
      },
    });
    expect(boxRequests[0]).toMatchObject({ expectedRevision: 5n });
  });

  test('boxes straight away when the settings are already saved', async () => {
    const { transport, calls, boxRequests } = boxTransport(savedBox(5, []));
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    const { result } = renderHook(() => useBoxClusterMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ settings: { ...reviewed, ...openedAt(4) }, opened: openedAt(4) });
    });

    expect(calls).toEqual(['box']);
    expect(boxRequests[0]).toMatchObject({ expectedRevision: 4n });
  });

  test('won’t box when the save came back with someone else’s settings', async () => {
    const { transport, calls } = boxTransport(savedBox(6, ['someone-else']));
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    const { result } = renderHook(() => useBoxClusterMutation(), { wrapper });

    let failure: unknown;
    await act(async () => {
      failure = await result.current.mutateAsync({ settings: reviewed, opened: openedAt(4) }).catch((error) => error);
    });

    expect(calls).toEqual(['save']);
    expect(isStaleRevisionError(failure)).toBe(true);
    expect(result.current.savedBox).toBeUndefined();
  });

  test('when Box fails after its own save, reports the box that save left', async () => {
    const { transport, calls } = boxTransport(
      savedBox(5, ['shadow-orders']),
      new ConnectError('a data migration is still running', Code.FailedPrecondition)
    );
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    const { result } = renderHook(() => useBoxClusterMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ settings: reviewed, opened: openedAt(4) }).catch(() => undefined);
    });

    expect(calls).toEqual(['save', 'box']);
    expect(result.current.savedBox).toMatchObject({ revision: 5n, exemptPrincipals: ['shadow-orders'] });
    act(() => result.current.reset());
    expect(result.current.savedBox).toBeUndefined();
  });
});

describe('useShadowBoxStatusQuery when the status can’t be read', () => {
  beforeEach(() => {
    flags.enableShadowBoxing = true;
    useSupportedFeaturesStore.setState({ shadowBoxService: true });
  });

  const intervalOf = (queryClient: ReturnType<typeof connectQueryWrapper>['queryClient']) => {
    const query = queryClient
      .getQueryCache()
      .getAll()
      .find((candidate) => JSON.stringify(candidate.queryKey).includes('GetShadowBoxStatus'));
    const interval = query?.observers[0]?.options.refetchInterval as ((q: typeof query) => number | false) | undefined;
    return interval?.(query);
  };

  test('a viewer who isn’t a superuser stops polling, and the status says why rather than vanishing', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowBoxStatus, () => {
        throw new ConnectError('denied', Code.PermissionDenied);
      });
    });
    const { wrapper, queryClient } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useShadowBoxStatusQuery(), { wrapper });

    await waitFor(() => expect(result.current.access).toBe('forbidden'));
    expect(result.current.available).toBe(true);
    expect(result.current.known).toBe(false);
    expect(intervalOf(queryClient)).toBe(false);
  });

  test('a cluster without the API reads as unavailable', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowBoxStatus, () => {
        throw new ConnectError('no such service', Code.Unimplemented);
      });
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useShadowBoxStatusQuery(), { wrapper });

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.access).toBe('unsupported');
  });

  test('with no controller leader, asks the broker for its own copy and keeps blocking writes it rejects', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowBoxStatus, () => {
        throw new ConnectError('no controller leader', Code.Unavailable);
      });
      rpc(getShadowBoxBrokerStatus, () =>
        create(GetShadowBoxBrokerStatusResponseSchema, {
          broker: { nodeId: 1, box: { state: ShadowBoxState.BOXED, revision: 18n } },
        })
      );
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useShadowBoxStatusQuery(), { wrapper });

    await waitFor(() => expect(result.current.ownCopies).toEqual([{ nodeId: 1, phase: 'boxed', revision: 18n }]));
    expect(result.current.noLeader).toBe(true);
    expect(result.current.known).toBe(false);
    expect(result.current.blocking).toBe(true);
  });
});

describe('describeShadowBoxError', () => {
  test.each([
    [
      new ConnectError('Shadow boxing revision has changed', Code.FailedPrecondition),
      'Someone else changed the box since this page read it. Review its current state, then try again.',
    ],
    [
      new ConnectError('cannot start while a shadow link is configured', Code.FailedPrecondition),
      'This cluster has a shadow link that hasn’t failed over, so it’s still a shadow cluster. Box its source instead, or fail the link over first. Redpanda said: “cannot start while a shadow link is configured”',
    ],
    [
      new ConnectError('shadow boxing is not active until every broker runs v26.3.1', Code.FailedPrecondition),
      'Shadow boxing turns on once every broker runs Redpanda v26.3.1 or later. Redpanda said: “shadow boxing is not active until every broker runs v26.3.1”',
    ],
    [
      new ConnectError('cannot start while data migration 7 is unfinished', Code.FailedPrecondition),
      'A data migration on this cluster hasn’t finished. Box it once the migration is done. Redpanda said: “cannot start while data migration 7 is unfinished”',
    ],
    [
      new ConnectError('something else', Code.FailedPrecondition),
      'Redpanda refused the change. Redpanda said: “something else”',
    ],
    [
      new ConnectError('took too long', Code.DeadlineExceeded),
      'The call took over 5 seconds and may still apply. Check the box’s state before you try again.',
    ],
    [new ConnectError('nope', Code.PermissionDenied), 'Only superusers can box, unbox or change shadow box settings.'],
    [
      new ConnectError('no leader', Code.Unavailable),
      'There’s no controller leader right now, or a broker is shutting down. Try again in a moment.',
    ],
    [new ConnectError('bad mask', Code.InvalidArgument), 'Redpanda rejected the request. Redpanda said: “bad mask”'],
  ])('%s', (error, message) => {
    expect(describeShadowBoxError(error)).toBe(message);
  });

  test('only a revision change counts as stale', () => {
    expect(isStaleRevisionError(new ConnectError('Shadow boxing revision has changed', Code.FailedPrecondition))).toBe(
      true
    );
    expect(isStaleRevisionError(new ConnectError('data migration 7 is unfinished', Code.FailedPrecondition))).toBe(
      false
    );
  });
});
