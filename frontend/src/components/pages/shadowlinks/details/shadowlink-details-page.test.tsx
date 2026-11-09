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
import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const flags = rs.hoisted(() => ({ enableClusterFencing: false }));
const host = rs.hoisted(() => ({ embedded: true }));
const route = rs.hoisted(() => ({ search: {} as { tab?: string } }));

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useParams: () => ({ name: 'orders-dr' }),
    useSearch: () => route.search,
    useNavigate: () => rs.fn(() => Promise.resolve()),
  };
});
rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    isEmbedded: rs.fn(() => host.embedded),
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
  useListShadowTopicQuery: rs.fn(() => ({
    data: undefined,
    isError: false,
    error: null,
    refetch: rs.fn(() => Promise.resolve({})),
  })),
}));

function MockShadowLinkDetails() {
  return <div data-testid="overview-stub" />;
}

function MockTasksTable() {
  return null;
}

function MockShadowLinkConfiguration() {
  return null;
}

function MockFailoverTab() {
  return <div data-testid="failover-stub" />;
}

rs.mock('./shadow-link-details', () => ({ ShadowLinkDetails: MockShadowLinkDetails }));
rs.mock('./tasks-table', () => ({ TasksTable: MockTasksTable }));
rs.mock('./config/shadow-link-configuration', () => ({ ShadowLinkConfiguration: MockShadowLinkConfiguration }));
rs.mock('./failover-tab', () => ({ FailoverTab: MockFailoverTab }));
rs.mock('state/ui-state', () => ({ uiState: { pageTitle: '', pageBreadcrumbs: [] } }));

import type { ShadowLinkSource } from 'federation/types';
import { useListShadowTopicQuery } from 'react-query/api/shadowlink';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { render } from 'test-utils';

import { ShadowLinkDetailsPage } from './shadowlink-details-page';

const FENCED_SOURCE: ShadowLinkSource = {
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod',
  fence: { status: 'known', state: 'fenced', revision: '3', exemptPrincipals: [], allowAllReads: true, brokers: [] },
};

const unavailable = (reason: 'error' | 'unsupported' | 'no-leader'): ShadowLinkSource => ({
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod',
  fence: { status: 'unavailable', reason },
});

const hostWith = (source: ShadowLinkSource | undefined, resolving = false) =>
  useClusterFenceStore.setState({
    topology: {
      clusterName: 'dr',
      readers: [],
      sources: source ? { 'orders-dr': source } : {},
      resolving,
      readersIncomplete: false,
    },
  });

/** Opens the page at ?tab=failover, which only means something with the Failover tab. */
const renderAtFailoverTab = (clusterFencing: boolean) => {
  const user = userEvent.setup();
  flags.enableClusterFencing = clusterFencing;
  route.search = { tab: 'failover' };
  render(<ShadowLinkDetailsPage />);
  return user;
};

/** As before cluster fencing: no Failover tab, no lag polling, and the original confirmation. */
const expectPageAsBefore = async (user: ReturnType<typeof userEvent.setup>) => {
  expect(screen.queryByTestId('failover-tab-trigger')).not.toBeInTheDocument();
  expect(screen.getByTestId('overview-stub')).toBeInTheDocument();
  for (const [, options] of rs.mocked(useListShadowTopicQuery).mock.calls) {
    expect(options).toMatchObject({ enabled: false });
  }

  await user.click(screen.getByRole('button', { name: 'Failover all topics' }));
  expect(await screen.findByText('Confirm Failover', { selector: 'h2' })).toBeVisible();
};

describe('the ShadowLinkDetailsPage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    host.embedded = true;
    route.search = {};
    useClusterFenceStore.setState({ topology: null });
  });

  test('in Cloud with cluster fencing off, looks and fetches exactly as before', async () => {
    hostWith(FENCED_SOURCE);
    await expectPageAsBefore(renderAtFailoverTab(false));
  });

  test('with cluster fencing on and the source’s fence readable, adds the Failover tab and checks readiness', async () => {
    hostWith(FENCED_SOURCE);
    const user = renderAtFailoverTab(true);

    expect(screen.getByTestId('failover-tab-trigger')).toHaveTextContent('Failover');
    expect(screen.getByTestId('failover-stub')).toBeInTheDocument();
    const options = rs.mocked(useListShadowTopicQuery).mock.calls.at(-1)?.[1] as {
      enabled: boolean;
      refetchInterval: (query: { state: { status: string } }) => number | false;
    };
    expect(options.enabled).toBe(true);
    expect(options.refetchInterval({ state: { status: 'success' } })).toBe(3000);

    await user.click(screen.getByRole('button', { name: 'Fail over all topics' }));
    expect(await screen.findByTestId('failover-readiness')).toBeVisible();
  });

  test.each([
    [
      'self-hosted, with no host to read the source',
      () => {
        host.embedded = false;
        useClusterFenceStore.setState({ topology: null });
      },
    ],
    ['the source is outside Cloud', () => hostWith({ kind: 'external', bootstrapServers: ['kafka:9092'] })],
    ['the source’s fence can’t be read', () => hostWith(unavailable('unsupported'))],
    ['the host couldn’t resolve the source', () => hostWith(undefined)],
    ['the source was already unreadable when the page opened', () => hostWith(unavailable('no-leader'))],
  ])('with cluster fencing on but %s, the page is as before', async (_label, arrange) => {
    arrange();
    await expectPageAsBefore(renderAtFailoverTab(true));
  });

  describe('once the source’s fence has been read', () => {
    const sourceBecomes = (reason: 'error' | 'unsupported') => act(() => hostWith(unavailable(reason)));

    test('a passing read failure keeps the Failover tab and the guided failover', () => {
      hostWith(FENCED_SOURCE);
      renderAtFailoverTab(true);
      sourceBecomes('error');

      expect(screen.getByTestId('failover-tab-trigger')).toBeInTheDocument();
      expect(screen.getByTestId('failover-stub')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fail over all topics' })).toBeVisible();
    });

    test('a source that says it doesn’t support fencing falls back to the page as before', () => {
      hostWith(FENCED_SOURCE);
      renderAtFailoverTab(true);
      sourceBecomes('unsupported');

      expect(screen.queryByTestId('failover-tab-trigger')).not.toBeInTheDocument();
      expect(screen.getByTestId('overview-stub')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Failover all topics' })).toBeVisible();
    });
  });

  describe('a tab the user picked', () => {
    const renderWithFencing = () => {
      const user = userEvent.setup();
      flags.enableClusterFencing = true;
      render(<ShadowLinkDetailsPage />);
      return user;
    };

    test('stays open when the Failover tab appears', async () => {
      hostWith(undefined, true);
      const user = renderWithFencing();
      await user.click(screen.getByTestId('tasks-tab'));
      act(() => hostWith(FENCED_SOURCE));

      expect(screen.getByTestId('failover-tab-trigger')).toBeInTheDocument();
      expect(screen.getByTestId('tasks-tab')).toHaveAttribute('aria-selected', 'true');
    });

    test('stays open when the Failover tab goes', async () => {
      hostWith(FENCED_SOURCE);
      const user = renderWithFencing();
      await user.click(screen.getByTestId('configuration-tab'));
      act(() => hostWith(unavailable('unsupported')));

      expect(screen.queryByTestId('failover-tab-trigger')).not.toBeInTheDocument();
      expect(screen.getByTestId('configuration-tab')).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('while the host is still resolving the source, only a link to the Failover tab shows it', () => {
    hostWith(undefined, true);
    renderAtFailoverTab(true);
    expect(screen.getByTestId('failover-stub')).toBeInTheDocument();
    cleanup();

    route.search = {};
    render(<ShadowLinkDetailsPage />);
    expect(screen.queryByTestId('failover-tab-trigger')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Failover all topics' })).toBeVisible();
  });
});
