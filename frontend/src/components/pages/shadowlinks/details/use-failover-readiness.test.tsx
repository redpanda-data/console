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

import { beforeEach, describe, expect, onTestFinished, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import type { ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

const noTopics = rs.hoisted(() => () => ({ data: undefined, isError: false, error: null, refetch: rs.fn() }));

rs.mock('react-query/api/shadowlink', () => ({
  useListShadowTopicQuery: rs.fn(noTopics),
}));

import { useListShadowTopicQuery } from 'react-query/api/shadowlink';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { useFailoverReadiness } from './use-failover-readiness';
import type { UnifiedShadowLink } from '../model';

const link = (name: string) => ({ name }) as UnifiedShadowLink;

const KNOWN_SOURCE: ShadowLinkSource = {
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod',
  box: { status: 'known', state: 'boxed', revision: '3', exemptPrincipals: [], allowAllReads: true, brokers: [] },
};

const withSource = (source: ShadowLinkSource | undefined, resolving = false) =>
  useShadowBoxStore.setState({
    topology: {
      clusterName: 'dr',
      readers: [],
      sources: source ? { 'orders-dr': source } : {},
      resolving,
      readersIncomplete: false,
    },
  });

const lastTopicsOptions = () =>
  rs.mocked(useListShadowTopicQuery).mock.calls.at(-1)?.[1] as {
    enabled: boolean;
    refetchInterval: (query: { state: { status: string } }) => number | false;
  };

describe('useFailoverReadiness', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    useShadowBoxStore.setState({ topology: null });
  });

  test('reads the source’s fence through the host, and polls lag at the given pace', () => {
    withSource(KNOWN_SOURCE);
    const { result } = renderHook(() => useFailoverReadiness(link('orders-dr'), { pollMs: 3000, enabled: true }));

    expect(result.current.readiness?.box).toMatchObject({ kind: 'cloud', boxed: true });
    expect(lastTopicsOptions().enabled).toBe(true);
    expect(lastTopicsOptions().refetchInterval({ state: { status: 'success' } })).toBe(3000);
    expect(lastTopicsOptions().refetchInterval({ state: { status: 'error' } })).toBe(30_000);
  });

  describe('once the source’s fence has been read in this visit', () => {
    const renderRead = () => {
      withSource(KNOWN_SOURCE);
      const rendered = renderHook(() => useFailoverReadiness(link('orders-dr'), { pollMs: 3000, enabled: true }));
      expect(rendered.result.current.available).toBe(true);
      return rendered;
    };
    const sourceBecomes = (reason: 'error' | 'unsupported') =>
      act(() =>
        withSource({ kind: 'cloud', clusterId: 'prod', clusterName: 'prod', box: { status: 'unavailable', reason } })
      );

    test('a passing read failure keeps the Failover tab, and says the fence can’t be read right now', () => {
      const { result } = renderRead();
      sourceBecomes('error');

      expect(result.current.available).toBe(true);
      expect(result.current.readiness?.box).toMatchObject({ kind: 'unreadable', reason: 'error' });
      expect(result.current.readiness?.failover.ready).toBe(false);
    });

    test('a source that says it doesn’t support fencing ends it', () => {
      const { result } = renderRead();
      sourceBecomes('unsupported');

      expect(result.current.readiness).toBeUndefined();
      expect(result.current.available).toBe(false);
    });
  });

  test('a failed refresh marks the lag it kept as out of date', () => {
    withSource(KNOWN_SOURCE);
    onTestFinished(() => {
      rs.mocked(useListShadowTopicQuery).mockImplementation(noTopics as unknown as typeof useListShadowTopicQuery);
    });
    rs.mocked(useListShadowTopicQuery).mockReturnValue({
      data: { shadowTopics: [{ topicName: 'orders-events', state: ShadowTopicState.ACTIVE, totalLag: 0n }] },
      isError: true,
      error: new Error('unavailable'),
      refetch: rs.fn(),
    } as unknown as ReturnType<typeof useListShadowTopicQuery>);
    const { result } = renderHook(() => useFailoverReadiness(link('orders-dr'), { pollMs: 3000, enabled: true }));

    expect(result.current.readiness?.lag).toMatchObject({ caughtUp: 1, stale: true });
  });
});
