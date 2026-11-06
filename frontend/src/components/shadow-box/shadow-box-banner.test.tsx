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

describe('the ShadowBoxBanner', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.setSystemTime(NOW);
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  test('renders nothing while the cluster is unfenced', () => {
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });
    expect(screen.queryByTestId('shadow-box-banner')).not.toBeInTheDocument();
  });

  test('a fenced cluster gets a title, one sentence, and one way to its fence status', () => {
    mockStatus('boxed');
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster is fenced');
    expect(banner).toHaveTextContent('Every broker rejects writes.');
    expect(banner).not.toHaveTextContent('REQUEST_TIMED_OUT');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toBe(screen.getByTestId('shadow-box-banner-view-status'));
    expect(screen.getByTestId('shadow-box-banner-view-status')).toHaveAttribute('href', '/shadowlinks?tab=source');
  });

  test('warns when the fence exempts nobody', () => {
    mockStatus('boxed', { exemptPrincipals: [] });
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent('It exempts nobody');
  });

  test('while fencing, says brokers block as they pick it up', () => {
    mockStatus('boxing', { stateChangedAt: new Date(NOW) }, [
      { nodeId: 1, status: 'confirmed', blocks: true },
      { nodeId: 2, status: 'not-answering', blocks: undefined },
    ]);
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster is being fenced');
    expect(banner).toHaveTextContent('Each broker rejects writes as soon as it picks up the fence.');
  });

  test('a settings change while fenced reads as writes staying blocked, not as a new fence', () => {
    mockStatus('boxing', {}, [
      { nodeId: 1, status: 'confirmed', blocks: true },
      { nodeId: 2, status: 'behind', blocks: true },
    ]);
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster is applying new fence settings');
    expect(banner).toHaveTextContent('Writes stay blocked on every broker');
  });

  test('while unfencing, says writes come back as brokers pick it up', () => {
    mockStatus('unboxing', { allowAllReads: true });
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent('This cluster is being unfenced');
  });

  test('isn’t shown on the Cluster fence tab, which shows the same and more', () => {
    mockStatus('boxed');
    renderWithFileRoutes(<ShadowBoxBanner />, {
      initialLocation: '/shadowlinks?tab=source',
      transport: routeLoaderTransport,
    });

    expect(screen.queryByTestId('shadow-box-banner')).not.toBeInTheDocument();
  });
});
