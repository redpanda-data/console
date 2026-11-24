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

import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { beforeEach, describe, expect, onTestFinished, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import type { ShadowLinkSource } from 'components/cluster-fence/shadow-link-topology';
import { listShadowLinkTopics } from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { connectQueryWrapper, waitFor } from 'test-utils';

import { useFailoverReadiness } from './use-failover-readiness';
import { type UnifiedShadowLink, UnifiedShadowLinkState } from '../model';

const ORDERS_LINK: UnifiedShadowLink = {
  name: 'orders-dr',
  id: 'orders-dr-id',
  state: UnifiedShadowLinkState.ACTIVE,
  configurations: undefined,
  tasksStatus: [],
  syncedShadowTopicProperties: [],
};

const KNOWN_SOURCE: ShadowLinkSource = {
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod',
  fence: { status: 'known', state: 'fenced', revision: 3n, exemptPrincipals: [], allowAllReads: true, brokers: [] },
};

const withSource = (source: ShadowLinkSource) =>
  useClusterFenceStore.setState({
    topology: {
      clusterName: 'dr',
      readers: [],
      sources: { 'orders-dr': source },
      resolving: false,
      readersIncomplete: false,
    },
  });

function renderReadiness() {
  withSource(KNOWN_SOURCE);
  let unavailable = false;
  const reads: { name: string; pageSize: number }[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(listShadowLinkTopics, ({ shadowLinkName, pageSize }) => {
      reads.push({ name: shadowLinkName, pageSize });
      if (unavailable) {
        throw new ConnectError('Lag unavailable', Code.Unavailable);
      }
      return { shadowTopics: [{ topicName: 'orders-events', state: ShadowTopicState.ACTIVE, totalLag: 0n }] };
    });
  });
  const { wrapper } = connectQueryWrapper(
    { defaultOptions: { queries: { retry: false, gcTime: 0, refetchIntervalInBackground: true } } },
    transport
  );
  const rendered = renderHook(() => useFailoverReadiness(ORDERS_LINK, { pollMs: 3000, enabled: true }), { wrapper });
  return {
    ...rendered,
    reads,
    takeOffline: () => {
      unavailable = true;
    },
  };
}

const advance = (ms: number) => act(() => rs.advanceTimersByTimeAsync(ms));

async function expectNextRead(reads: readonly unknown[], beforeDeadline: number) {
  const previousCount = reads.length;
  await advance(beforeDeadline);
  expect(reads).toHaveLength(previousCount);
  await advance(2);
  expect(reads).toHaveLength(previousCount + 1);
}

function expectReadyToFailOver({ result, reads }: ReturnType<typeof renderReadiness>) {
  expect(result.current.readiness?.fence).toMatchObject({ kind: 'cloud', fenced: true });
  expect(result.current.readiness?.lag).toMatchObject({ caughtUp: 1, stale: false });
  expect(result.current.readiness?.failover.ready).toBe(true);
  expect(reads).toEqual([{ name: 'orders-dr', pageSize: -1 }]);
}

describe('useFailoverReadiness', () => {
  beforeEach(() => {
    const { topology } = useClusterFenceStore.getState();
    onTestFinished(() => useClusterFenceStore.setState({ topology }));
  });

  test('polls lag every 3s, keeps stale lag after a failure, and backs off to 30s', async () => {
    rs.useFakeTimers();
    onTestFinished(() => {
      rs.useRealTimers();
    });
    const rendered = renderReadiness();
    await advance(1);
    expectReadyToFailOver(rendered);

    rendered.takeOffline();
    await expectNextRead(rendered.reads, 2998);
    expect(rendered.result.current.readiness?.lag).toMatchObject({ caughtUp: 1, stale: true });
    expect(rendered.result.current.readiness?.failover.ready).toBe(false);
    await expectNextRead(rendered.reads, 29_998);
  });

  const sourceBecomes = (reason: 'error' | 'unsupported') =>
    act(() =>
      withSource({ kind: 'cloud', clusterId: 'prod', clusterName: 'prod', fence: { status: 'unavailable', reason } })
    );

  test('a passing fence read failure keeps the tab and reports that the fence is unreadable', async () => {
    const { result } = renderReadiness();
    await waitFor(() => expect(result.current.readiness?.lag).toMatchObject({ caughtUp: 1 }));

    sourceBecomes('error');

    expect(result.current.available).toBe(true);
    expect(result.current.readiness?.fence).toMatchObject({ kind: 'unreadable', reason: 'error' });
    expect(result.current.readiness?.failover.ready).toBe(false);
  });

  test('a source that doesn’t support fencing disables guided failover', async () => {
    const { result } = renderReadiness();
    await waitFor(() => expect(result.current.available).toBe(true));

    sourceBecomes('unsupported');

    expect(result.current.readiness).toBeUndefined();
    expect(result.current.available).toBe(false);
  });
});
