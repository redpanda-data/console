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

  test('says a fenced cluster rejects writes, what clients see, and offers Unfence', () => {
    mockStatus('boxed');
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster is fenced');
    expect(banner).toHaveTextContent('Fenced. Every broker rejects writes.');
    expect(banner).toHaveTextContent('Producers get REQUEST_TIMED_OUT and keep retrying');
    expect(banner).toHaveTextContent('consumer groups wait on COORDINATOR_NOT_AVAILABLE');
    expect(screen.getByTestId('shadow-box-banner-view-status')).toHaveAttribute('href', '/shadowlinks?tab=source');
    expect(screen.getByTestId('shadow-box-banner-unbox')).toBeVisible();
  });

  test('while fencing, says brokers block as they pick it up, and names one that isn’t answering', () => {
    mockStatus('boxing', { stateChangedAt: new Date(NOW) }, [
      { nodeId: 1, status: 'confirmed', blocks: true },
      { nodeId: 2, status: 'not-answering', blocks: undefined },
    ]);
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('Each broker rejects writes as soon as it picks up the fence. 1 of 2 have.');
    expect(banner).toHaveTextContent('Broker 2 isn’t answering');
    expect(banner).toHaveTextContent('There’s no timeout.');
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

  test('warns that retention keeps running once a fence has been held for long', () => {
    mockStatus('boxed', { stateChangedAt: new Date(NOW - 3 * 60 * MINUTE) });
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent(
      'Retention and compaction keep deleting old data'
    );
  });

  test('leaves out reads when every consumer may still read, and Unfence while unfencing', () => {
    mockStatus('unboxing', { allowAllReads: true });
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent('This cluster is being unfenced');
    expect(screen.queryByTestId('shadow-box-banner-unbox')).not.toBeInTheDocument();
  });
});
