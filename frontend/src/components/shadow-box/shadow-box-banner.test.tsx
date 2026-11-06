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
import { renderWithFileRoutes } from 'test-utils';

rs.mock('react-query/api/shadow-box', () => {
  const actual = rs.requireActual<typeof import('react-query/api/shadow-box')>('react-query/api/shadow-box');
  return { ...actual, useShadowBoxStatusQuery: rs.fn() };
});

import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';

import { ShadowBoxBanner } from './shadow-box-banner';
import type { BoxPhase, BoxSummary, BrokerProgress } from './shadow-box-model';

// The /shadowlinks route loader lists the cluster's links whenever the router lands on the page.
const routeLoaderTransport = createRouterTransport(({ rpc }) => {
  rpc(listShadowLinks, () => ({ shadowLinks: [] }));
});

const NOW = Date.UTC(2026, 5, 1, 12);
const MINUTE = 60 * 1000;

const mockStatus = (phase: BoxPhase, overrides: Partial<BoxSummary> = {}, brokers: BrokerProgress[] = []) =>
  rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
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
  } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);

const renderBanner = (initialLocation = '/topics') =>
  renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation, transport: routeLoaderTransport });

describe('the ShadowBoxBanner', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.setSystemTime(NOW);
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  test('renders nothing while the cluster is unfenced, or on the Cluster fence tab', () => {
    mockStatus('unboxed');
    const { unmount } = renderBanner();
    expect(screen.queryByTestId('shadow-box-banner')).not.toBeInTheDocument();
    unmount();

    mockStatus('boxed');
    renderBanner('/shadowlinks?tab=source');
    expect(screen.queryByTestId('shadow-box-banner')).not.toBeInTheDocument();
  });

  test('a fenced cluster gets a title, one sentence, and one way to its fence status', () => {
    mockStatus('boxed');
    renderBanner();

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster is fenced');
    expect(banner).toHaveTextContent('Every broker rejects writes.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toBe(screen.getByTestId('shadow-box-banner-view-status'));
    expect(screen.getByTestId('shadow-box-banner-view-status')).toHaveAttribute('href', '/shadowlinks?tab=source');
  });

  test.each([
    ['fencing', 'boxing', [{ nodeId: 2, status: 'behind', blocks: false }], 'This cluster is being fenced'],
    // A settings change while fenced: writes stay blocked, so it isn't a new fence.
    ['applying settings', 'boxing', [{ nodeId: 2, status: 'behind', blocks: true }], 'applying new fence settings'],
    ['unfencing', 'unboxing', [], 'This cluster is being unfenced'],
  ] as const)('while %s, the title says so', (_label, phase, brokers, title) => {
    mockStatus(phase, {}, [...brokers]);
    renderBanner();
    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent(title);
  });

  test('warns when the fence exempts nobody', () => {
    mockStatus('boxed', { exemptPrincipals: [] });
    renderBanner();
    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent('It exempts nobody');
  });

  test('with no controller leader, reports each broker’s own copy and whether writes are rejected', () => {
    rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
      known: false,
      blocking: true,
      summary: { phase: 'unboxed', revision: -1n, exemptPrincipals: [], allowAllReads: false },
      brokers: [],
      ownCopies: [
        { nodeId: 1, phase: 'boxed', revision: 4n },
        { nodeId: 2, errorMessage: 'timed out' },
      ],
    } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);
    renderBanner();

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster may be fenced');
    expect(banner).toHaveTextContent('broker 1 reports fenced. Writes to those brokers are rejected.');
    expect(screen.queryByTestId('shadow-box-banner-view-status')).not.toBeInTheDocument();
  });
});
