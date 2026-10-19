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
import userEvent from '@testing-library/user-event';

const flags = rs.hoisted(() => ({ enableShadowBoxing: false }));
const route = rs.hoisted(() => ({ search: {} as { tab?: string } }));

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useParams: () => ({ name: 'orders-dr' }),
    useSearch: () => route.search,
    useNavigate: () => rs.fn(),
  };
});
rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    isFeatureFlagEnabled: rs.fn((key: string) => flags[key as keyof typeof flags] ?? false),
    isServerless: rs.fn(() => false),
  };
});
rs.mock('react-query/api/shadowlink', () => ({
  useGetShadowLinkUnified: rs.fn(() => ({
    data: { name: 'orders-dr', tasksStatus: [] },
    isLoading: false,
    error: null,
    dataplaneError: null,
    refetch: rs.fn(),
  })),
  useDeleteShadowLinkUnified: rs.fn(() => ({ deleteShadowLink: rs.fn(), isPending: false })),
  useFailoverShadowLinkMutation: rs.fn(() => ({ mutate: rs.fn(), isPending: false })),
  useListShadowTopicQuery: rs.fn(() => ({ data: undefined, isError: false, error: null, refetch: rs.fn() })),
}));
rs.mock('./shadow-link-details', () => ({ ShadowLinkDetails: () => <div data-testid="overview-stub" /> }));
rs.mock('./tasks-table', () => ({ TasksTable: () => null }));
rs.mock('./config/shadow-link-configuration', () => ({ ShadowLinkConfiguration: () => null }));
rs.mock('./cutover-tab', () => ({ CutoverTab: () => <div data-testid="cutover-stub" /> }));
rs.mock('state/ui-state', () => ({ uiState: { pageTitle: '', pageBreadcrumbs: [] } }));

import { useListShadowTopicQuery } from 'react-query/api/shadowlink';
import { render } from 'test-utils';

import { ShadowLinkDetailsPage } from './shadowlink-details-page';

describe('ShadowLinkDetailsPage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    route.search = {};
  });

  test('with shadow boxing off, looks and fetches exactly as before', async () => {
    const user = userEvent.setup();
    flags.enableShadowBoxing = false;
    route.search = { tab: 'cutover' };
    render(<ShadowLinkDetailsPage />);

    expect(screen.queryByTestId('cutover-tab-trigger')).not.toBeInTheDocument();
    expect(screen.getByTestId('overview-stub')).toBeInTheDocument();
    for (const [, options] of rs.mocked(useListShadowTopicQuery).mock.calls) {
      expect(options).toMatchObject({ enabled: false });
    }

    await user.click(screen.getByRole('button', { name: 'Failover all topics' }));
    expect(await screen.findByText('Confirm Failover', { selector: 'h2' })).toBeVisible();
  });

  test('with shadow boxing on, adds the Cutover tab, reads lag, and checks readiness before failing over', async () => {
    const user = userEvent.setup();
    flags.enableShadowBoxing = true;
    route.search = { tab: 'cutover' };
    render(<ShadowLinkDetailsPage />);

    expect(screen.getByTestId('cutover-tab-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('cutover-stub')).toBeInTheDocument();
    const options = rs.mocked(useListShadowTopicQuery).mock.calls.at(-1)?.[1] as {
      enabled: boolean;
      refetchInterval: (query: { state: { status: string } }) => number | false;
    };
    expect(options.enabled).toBe(true);
    expect(options.refetchInterval({ state: { status: 'success' } })).toBe(3000);

    await user.click(screen.getByRole('button', { name: 'Fail over all topics' }));
    expect(await screen.findByTestId('failover-readiness')).toBeVisible();
  });
});
