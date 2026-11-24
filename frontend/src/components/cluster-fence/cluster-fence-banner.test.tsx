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

import { createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { screen } from '@testing-library/react';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';
import { renderWithFileRoutes } from 'test-utils';

import { ClusterFenceBanner } from './cluster-fence-banner';
import type { BrokerProgress, FencePhase, FenceSummary } from './cluster-fence-model';

rs.mock('react-query/api/cluster-fence', () => {
  const actual = rs.requireActual<typeof import('react-query/api/cluster-fence')>('react-query/api/cluster-fence');
  return { ...actual, useClusterFenceStatusQuery: rs.fn() };
});

const routeLoaderTransport = createRouterTransport(({ rpc }) => {
  rpc(listShadowLinks, () => ({ shadowLinks: [] }));
});

const NOW = Date.UTC(2026, 5, 1, 12);
const MINUTE = 60 * 1000;

const mockStatus = (phase: FencePhase, overrides: Partial<FenceSummary> = {}, brokers: BrokerProgress[] = []) =>
  rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
    known: true,
    available: true,
    summary: {
      phase,
      revision: 3n,
      stateChangedAt: new Date(NOW - 12 * MINUTE),
      exemptPrincipals: ['shadow-orders'],
      allowAllReads: false,
      ...overrides,
    },
    brokers,
    ownCopies: [],
  } as unknown as ReturnType<typeof useClusterFenceStatusQuery>);

const renderBanner = (initialLocation = '/topics') =>
  renderWithFileRoutes(<ClusterFenceBanner />, { initialLocation, transport: routeLoaderTransport });

describe('the ClusterFenceBanner', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.setSystemTime(NOW);
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  test('renders nothing while the cluster is unfenced, or on the Cluster fence tab', () => {
    mockStatus('unfenced');
    const { unmount } = renderBanner();
    expect(screen.queryByTestId('cluster-fence-banner')).not.toBeInTheDocument();
    unmount();

    mockStatus('fenced');
    renderBanner('/shadowlinks?tab=source');
    expect(screen.queryByTestId('cluster-fence-banner')).not.toBeInTheDocument();
  });

  test('a fenced cluster gets a title, one sentence, and one way to its fence status', () => {
    mockStatus('fenced');
    renderBanner();

    const banner = screen.getByTestId('cluster-fence-banner');
    expect(banner).toHaveTextContent('This cluster is fenced');
    expect(banner).toHaveTextContent('Every broker rejects writes.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toBe(screen.getByTestId('cluster-fence-banner-view-status'));
    expect(screen.getByTestId('cluster-fence-banner-view-status')).toHaveAttribute('href', '/shadowlinks?tab=source');
  });

  test.each([
    ['fencing', 'fencing', [{ nodeId: 2, status: 'behind', blocks: false }], 'This cluster is being fenced'],
    // A settings change while fenced: writes stay blocked, so it isn't a new fence.
    ['applying settings', 'fencing', [{ nodeId: 2, status: 'behind', blocks: true }], 'applying new fence settings'],
    ['unfencing', 'unfencing', [], 'This cluster is being unfenced'],
  ] as const)('while %s, the title says so', (_label, phase, brokers, title) => {
    mockStatus(phase, {}, [...brokers]);
    renderBanner();
    expect(screen.getByTestId('cluster-fence-banner')).toHaveTextContent(title);
  });

  test('warns when the fence exempts nobody', () => {
    mockStatus('fenced', { exemptPrincipals: [] });
    renderBanner();
    expect(screen.getByTestId('cluster-fence-banner')).toHaveTextContent('No one is exempt');
  });

  test('with no controller leader, reports each broker’s own copy and whether writes are rejected', () => {
    rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
      known: false,
      blocking: true,
      summary: { phase: 'unfenced', revision: -1n, exemptPrincipals: [], allowAllReads: false },
      brokers: [],
      ownCopies: [
        { nodeId: 1, phase: 'fenced', revision: 4n },
        { nodeId: 2, errorMessage: 'timed out' },
      ],
    } as unknown as ReturnType<typeof useClusterFenceStatusQuery>);
    renderBanner();

    const banner = screen.getByTestId('cluster-fence-banner');
    expect(banner).toHaveTextContent('This cluster may be fenced');
    expect(banner).toHaveTextContent('broker 1 reports fenced. Writes to those brokers are rejected.');
    expect(screen.queryByTestId('cluster-fence-banner-view-status')).not.toBeInTheDocument();
  });

  test('with no controller leader and no broker’s own copy yet, goes by the last status read', () => {
    rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
      known: false,
      blocking: true,
      summary: { phase: 'fenced', revision: 3n, exemptPrincipals: ['shadow-orders'], allowAllReads: false },
      brokers: [{ nodeId: 1, status: 'confirmed', copy: { phase: 'fenced', revision: 3n }, blocks: true }],
      ownCopies: [{ nodeId: 1 }],
    } as unknown as ReturnType<typeof useClusterFenceStatusQuery>);
    renderBanner();

    const banner = screen.getByTestId('cluster-fence-banner');
    expect(banner).toHaveTextContent('This cluster may be fenced');
    expect(banner).toHaveTextContent(
      'so Console is asking each broker for its own copy of the fence. Until every broker answers, Console goes by the last status it read: fenced, so writes may be rejected.'
    );
  });
});
