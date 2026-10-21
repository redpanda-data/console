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
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  box,
  getShadowBoxStatus,
  updateShadowBoxSettings,
} from 'protogen/redpanda/api/console/v1alpha1/shadowbox-ShadowBoxService_connectquery';
import {
  BoxResponseSchema,
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
    revision: BigInt(3),
    settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
  },
  brokers: [{ nodeId: 0, box: { state: ShadowBoxState.BOXED, revision: BigInt(3) } }],
});

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
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useShadowBoxStatusQuery(), { wrapper });

    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.summary).toMatchObject({ phase: 'boxed', exemptPrincipals: ['shadow-orders'] });
    expect(result.current.brokers).toEqual([{ nodeId: 0, status: 'applied' }]);
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
    arrange();
    const handler = rs.fn(() => boxedStatus);
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowBoxStatus, handler);
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useShadowBoxStatusQuery(), { wrapper });

    expect(result.current.available).toBe(false);
    expect(result.current.known).toBe(false);
    /** A router-transport handler only runs after a microtask, so let one pass before asserting. */
    await new Promise((resolve) => setTimeout(resolve, 0));
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
      return create(BoxResponseSchema, { box: { state: ShadowBoxState.BOXING, revision: BigInt(6) } });
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
      expectedRevision: BigInt(4),
      updateMask: { paths: ['read_policy', 'skip_transaction_expiration'] },
      settings: {
        readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads: false },
        skipTransactionExpiration: true,
      },
    });
    expect(boxRequests[0]).toMatchObject({ expectedRevision: BigInt(5) });
  });

  test('boxes straight away when the settings are already saved', async () => {
    const { transport, calls, boxRequests } = boxTransport(savedBox(5, []));
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
    const { result } = renderHook(() => useBoxClusterMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ settings: { ...reviewed, ...openedAt(4) }, opened: openedAt(4) });
    });

    expect(calls).toEqual(['box']);
    expect(boxRequests[0]).toMatchObject({ expectedRevision: BigInt(4) });
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
    expect(result.current.savedBox).toMatchObject({ revision: BigInt(5), exemptPrincipals: ['shadow-orders'] });
    act(() => result.current.reset());
    expect(result.current.savedBox).toBeUndefined();
  });
});

describe('useShadowBoxStatusQuery for a viewer the API isn’t there for', () => {
  beforeEach(() => {
    flags.enableShadowBoxing = true;
    useSupportedFeaturesStore.setState({ shadowBoxService: true });
  });

  test('reports itself unavailable and stops polling', async () => {
    const handler = rs.fn(() => {
      throw new ConnectError('denied', Code.PermissionDenied);
    });
    const transport = createRouterTransport(({ rpc }) => {
      rpc(getShadowBoxStatus, handler);
    });
    const { wrapper, queryClient } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useShadowBoxStatusQuery(), { wrapper });

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.known).toBe(false);
    const query = queryClient.getQueryCache().getAll()[0];
    expect(query?.observers[0]?.options.refetchInterval).toBeTypeOf('function');
    const interval = query?.observers[0]?.options.refetchInterval as (q: typeof query) => number | false;
    expect(interval(query)).toBe(false);
  });
});

describe('describeShadowBoxError', () => {
  test.each([
    [
      new ConnectError('Shadow boxing revision has changed', Code.FailedPrecondition),
      'The shadow box changed while this was open. Review its current status, then try again.',
    ],
    [
      new ConnectError('Shadow boxing cannot start while a shadow link is configured', Code.FailedPrecondition),
      'This cluster has a shadow link of its own, so it’s a shadow cluster. Only a shadow link’s source cluster can be boxed.',
    ],
    [
      new ConnectError('Shadow boxing feature is not active', Code.FailedPrecondition),
      'Shadow boxing isn’t active on this cluster yet. Every broker must run a Redpanda version that supports it.',
    ],
    [
      new ConnectError('The shadow box command timed out and may still apply', Code.DeadlineExceeded),
      'The request timed out and may still apply. Check the box status before you try again.',
    ],
    [new ConnectError('nope', Code.PermissionDenied), 'You don’t have permission to change this cluster’s shadow box.'],
    [
      new ConnectError('Cannot box the cluster while data migration 7 is unfinished', Code.FailedPrecondition),
      'Cannot box the cluster while data migration 7 is unfinished',
    ],
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
