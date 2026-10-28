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
      revision: 3n,
      stateChangedAt: new Date(Date.now() - 12 * 60 * 1000),
      exemptPrincipals: ['shadow-orders'],
      allowAllReads: false,
      skipTransactionExpiration: false,
      ...overrides,
    },
    brokers,
  } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);

describe('the ShadowBoxBanner', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('renders nothing while the cluster is unboxed', () => {
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });
    expect(screen.queryByTestId('shadow-box-banner')).not.toBeInTheDocument();
  });

  test('says a boxed cluster rejects writes, what clients see, and offers Unbox', () => {
    mockStatus('boxed');
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster is shadow boxed');
    expect(banner).toHaveTextContent('Boxed. Every broker rejects writes.');
    expect(banner).toHaveTextContent('Producers get REQUEST_TIMED_OUT and keep retrying');
    expect(banner).toHaveTextContent('Topic config changes still go through.');
    expect(screen.getByTestId('shadow-box-banner-view-status')).toHaveAttribute('href', '/shadowlinks?tab=source');
    expect(screen.getByTestId('shadow-box-banner-unbox')).toBeVisible();
  });

  test('while boxing, says brokers block as they pick it up, and names one that isn’t answering', () => {
    mockStatus('boxing', { stateChangedAt: new Date() }, [
      { nodeId: 1, status: 'confirmed', blocks: true },
      { nodeId: 2, status: 'not-answering', blocks: undefined },
    ]);
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('Each broker rejects writes as soon as it picks up the box. 1 of 2 have.');
    expect(banner).toHaveTextContent('Broker 2 isn’t answering');
    expect(banner).toHaveTextContent('There’s no timeout.');
  });

  test('a settings change while boxed reads as writes staying blocked, not as a new box', () => {
    mockStatus('boxing', {}, [
      { nodeId: 1, status: 'confirmed', blocks: true },
      { nodeId: 2, status: 'behind', blocks: true },
    ]);
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    const banner = screen.getByTestId('shadow-box-banner');
    expect(banner).toHaveTextContent('This cluster is applying new shadow box settings');
    expect(banner).toHaveTextContent('Writes stay blocked on every broker');
  });

  test('warns that retention keeps running once a box has been held for long', () => {
    mockStatus('boxed', { stateChangedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent(
      'Retention and compaction keep deleting old data'
    );
  });

  test('leaves out reads when every consumer may still read, and Unbox while unboxing', () => {
    mockStatus('unboxing', { allowAllReads: true });
    renderWithFileRoutes(<ShadowBoxBanner />, { initialLocation: '/topics' });

    expect(screen.getByTestId('shadow-box-banner')).toHaveTextContent('This cluster is being unboxed');
    expect(screen.queryByTestId('shadow-box-banner-unbox')).not.toBeInTheDocument();
  });
});
