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

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';
import { config } from 'config';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

rs.mock('react-query/api/shadowlink', () => ({
  useListShadowTopicQuery: rs.fn(() => ({ data: undefined, isError: false, error: null, refetch: rs.fn() })),
}));

import { useListShadowTopicQuery } from 'react-query/api/shadowlink';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { useCutoverReadiness } from './use-cutover-readiness';
import type { UnifiedShadowLink } from '../model';

const link = (name: string) => ({ name }) as UnifiedShadowLink;

describe('useCutoverReadiness', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    config.clusterId = 'dr';
    useShadowBoxStore.setState({ topology: null });
  });

  afterEach(() => {
    config.clusterId = 'default';
  });

  test('remembers a manual confirmation for this cluster’s link only', () => {
    const { result, unmount } = renderHook(() =>
      useCutoverReadiness(link('orders-dr'), { pollMs: 3000, enabled: true })
    );

    act(() => result.current.setManuallyConfirmed(true));
    expect(result.current.readiness.box).toMatchObject({ kind: 'manual', confirmed: true });
    unmount();

    config.clusterId = 'other-shadow';
    const other = renderHook(() => useCutoverReadiness(link('orders-dr'), { pollMs: 3000, enabled: true }));
    expect(other.result.current.readiness.box).toMatchObject({ confirmed: false });
  });

  test('reads the confirmation once the link loads after the page', () => {
    window.sessionStorage.setItem('shadow-box-cutover-confirmed:dr:orders-dr', 'true');
    const { result, rerender } = renderHook(
      ({ shadowLink }: { shadowLink: UnifiedShadowLink | undefined }) =>
        useCutoverReadiness(shadowLink, { pollMs: 3000, enabled: true }),
      { initialProps: { shadowLink: undefined as UnifiedShadowLink | undefined } }
    );
    expect(result.current.readiness.box).toMatchObject({ confirmed: false });

    rerender({ shadowLink: link('orders-dr') });
    expect(result.current.readiness.box).toMatchObject({ confirmed: true });
  });

  test('while the host resolves links, the source step waits instead of asking for a confirmation', () => {
    useShadowBoxStore.setState({
      topology: { clusterName: 'dr', readers: [], sources: {}, resolving: true, readersIncomplete: false },
    });
    const { result } = renderHook(() => useCutoverReadiness(link('orders-dr'), { pollMs: 3000, enabled: true }));

    expect(result.current.readiness.box).toEqual({ kind: 'loading', source: undefined });
  });

  test('polls lag at the given pace, and keeps trying slowly after a failed read', () => {
    renderHook(() => useCutoverReadiness(link('orders-dr'), { pollMs: 3000, enabled: true }));
    const options = rs.mocked(useListShadowTopicQuery).mock.calls.at(-1)?.[1] as {
      refetchInterval: (query: { state: { status: string } }) => number | false;
    };

    expect(options.refetchInterval({ state: { status: 'success' } })).toBe(3000);
    expect(options.refetchInterval({ state: { status: 'error' } })).toBe(30_000);
  });

  test('a failed refresh marks the lag it kept as out of date', () => {
    rs.mocked(useListShadowTopicQuery).mockReturnValueOnce({
      data: { shadowTopics: [{ topicName: 'orders-events', state: ShadowTopicState.ACTIVE, totalLag: BigInt(0) }] },
      isError: true,
      error: new Error('unavailable'),
      refetch: rs.fn(),
    } as unknown as ReturnType<typeof useListShadowTopicQuery>);
    const { result } = renderHook(() => useCutoverReadiness(link('orders-dr'), { pollMs: 3000, enabled: true }));

    expect(result.current.readiness.lag).toMatchObject({ caughtUp: 1, stale: true });
  });
});
