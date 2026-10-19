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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { screen } from '@testing-library/react';
import { renderWithFileRoutes } from 'test-utils';

rs.mock('react-query/api/shadow-box', () => {
  const actual = rs.requireActual<typeof import('react-query/api/shadow-box')>('react-query/api/shadow-box');
  return {
    ...actual,
    useShadowBoxStatusQuery: rs.fn(),
    useUnboxClusterMutation: rs.fn(() => ({ mutate: rs.fn(), reset: rs.fn(), isPending: false, error: null })),
  };
});

import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';

import { ShadowBoxBanner } from './shadow-box-banner';
import type { BoxPhase, BoxSummary, BrokerProgress } from './shadow-box-model';

const mockStatus = (phase: BoxPhase, overrides: Partial<BoxSummary> = {}, brokers: BrokerProgress[] = []) =>
  rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
    known: true,
    available: true,
    summary: {
      phase,
      revision: BigInt(3),
      stateChangedAt: new Date(Date.now() - 12 * 60 * 1000),
      exemptPrincipals: ['shadow-orders'],
      allowAllReads: false,
      skipTransactionExpiration: false,
      ...overrides,
    },
    brokers,
  } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);

describe('ShadowBoxBanner', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('renders nothing while the cluster is unboxed', () => {
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });
    expect(screen.queryByTestId('shadow-box-banner')).not.toBeInTheDocument();
  });

  test('says a boxed cluster rejects writes, for how long, and offers Unbox', () => {
    mockStatus('boxed');
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster is shadow boxed');
    expect(banner).toHaveTextContent('Clients can’t produce or consume, or change topics, ACLs, roles or schemas');
    expect(banner).toHaveTextContent('Boxed for 12 min.');
    expect(screen.getByTestId('shadow-box-banner-view-status')).toHaveAttribute('href', '/shadowlinks?tab=source');
    expect(screen.getByTestId('shadow-box-banner-unbox')).toBeVisible();
  });

  test('reports broker progress while boxing', () => {
    mockStatus('boxing', {}, [
      { nodeId: 0, status: 'applied' },
      { nodeId: 1, status: 'pending' },
    ]);
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent('(1 of 2 so far)');
  });

  test('warns that retention keeps running once a box has been held for long', () => {
    mockStatus('boxed', { stateChangedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent('Retention and compaction keep running');
  });

  test('leaves out reads when every consumer may still read, and Unbox while unboxing', () => {
    mockStatus('unboxing', { allowAllReads: true });
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent('This cluster is being unboxed');
    expect(screen.queryByTestId('shadow-box-banner-unbox')).not.toBeInTheDocument();
  });
});
