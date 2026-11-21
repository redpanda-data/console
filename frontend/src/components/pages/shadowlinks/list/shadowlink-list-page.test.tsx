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

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FencePhase, UNFENCED_SUMMARY } from 'components/cluster-fence/cluster-fence-model';
import {
  type ListShadowLinksResponse,
  ListShadowLinksResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import {
  ClusterFenceState,
  type GetClusterFenceStatusResponse,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { renderWithFileRoutes } from 'test-utils';

import { ShadowLinkListPage } from './shadowlink-list-page';

// Mock the data hook so we can drive query state (error / loading / data) directly.
rs.mock('react-query/api/shadowlink', () => ({
  useListShadowLinksQuery: rs.fn(),
}));

rs.mock('react-query/api/cluster-fence', () => {
  const actual = rs.requireActual<typeof import('react-query/api/cluster-fence')>('react-query/api/cluster-fence');
  return { ...actual, useClusterFenceStatusQuery: rs.fn() };
});

function MockClusterFenceSourcePanel() {
  return <div data-testid="cluster-fence-source-panel-stub" />;
}

rs.mock('components/cluster-fence/cluster-fence-source-panel', () => ({
  ClusterFenceSourcePanel: MockClusterFenceSourcePanel,
}));

// Mock toast notifications so we can assert on them.
rs.mock('sonner', () => ({
  toast: {
    success: rs.fn(),
    error: rs.fn(),
  },
}));

const mockedUseListShadowLinksQuery = rs.mocked(useListShadowLinksQuery);

const mockQueryResult = ({
  error,
  data,
  isLoading,
  isFetched,
}: {
  error?: ConnectError;
  data?: ListShadowLinksResponse;
  isLoading?: boolean;
  isFetched?: boolean;
}): ReturnType<typeof useListShadowLinksQuery> => {
  const client = new QueryClient();
  const queryKey = ['shadowlink-test'];
  const query = client.getQueryCache().build<ListShadowLinksResponse, ConnectError>(client, { queryKey });
  if (data !== undefined) {
    query.setData(data);
  }
  if (error !== undefined) {
    query.setState({ status: 'error', error, errorUpdateCount: 1 });
  }
  if (isLoading === true) {
    query.setState({ status: 'pending', fetchStatus: 'fetching', errorUpdateCount: isFetched === true ? 1 : 0 });
  }
  return new QueryObserver<ListShadowLinksResponse, ConnectError>(client, {
    queryKey,
    enabled: false,
  }).getCurrentResult();
};

const CREATE_SHADOW_LINK = /create shadow link/i;

// The /shadowlinks route loader lists the cluster's links whenever the router lands on the page.
const routeLoaderTransport = createRouterTransport(({ rpc }) => {
  rpc(listShadowLinks, () => ({ shadowLinks: [] }));
});

const fenceStates: Record<FencePhase, ClusterFenceState> = {
  unfenced: ClusterFenceState.UNFENCED,
  fencing: ClusterFenceState.FENCING,
  fenced: ClusterFenceState.FENCED,
  unfencing: ClusterFenceState.UNFENCING,
};

function fenceQueryResult(known: boolean, failed: boolean, phase: FencePhase) {
  const client = new QueryClient();
  const queryKey = ['fence-test'];
  const query = client.getQueryCache().build<GetClusterFenceStatusResponse, ConnectError>(client, { queryKey });
  if (known) {
    query.setData(
      create(GetClusterFenceStatusResponseSchema, {
        fence: {
          state: fenceStates[phase],
          revision: -1n,
          settings: { readPolicy: { allowAllReads: false, exemptPrincipals: [] } },
        },
      })
    );
  }
  if (failed) {
    query.setState({ status: 'error', error: new ConnectError('fence unavailable'), errorUpdateCount: 1 });
  }
  return new QueryObserver<GetClusterFenceStatusResponse, ConnectError>(client, {
    queryKey,
    enabled: false,
  }).getCurrentResult();
}

const mockFence = (status: { available: boolean; known?: boolean; phase?: FencePhase; isError?: boolean }) =>
  rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
    ...fenceQueryResult(status.known ?? false, status.isError ?? false, status.phase ?? 'unfenced'),
    available: status.available,
    access: 'ok',
    known: status.known ?? false,
    unreadable: false,
    ownCopies: [],
    brokers: [],
    blocking: status.known === true && (status.phase === 'fencing' || status.phase === 'fenced'),
    summary: { ...UNFENCED_SUMMARY, phase: status.phase ?? 'unfenced' },
  });

describe('the ShadowLinkListPage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mockFence({ available: false });
    useClusterFenceStore.setState({ topology: null });
  });

  test('renders the no-permission state (not a raw error) when the API returns PermissionDenied', async () => {
    const error = new ConnectError('you are not authorized to call this endpoint', Code.PermissionDenied);
    mockedUseListShadowLinksQuery.mockReturnValue(mockQueryResult({ error }));

    renderWithFileRoutes(<ShadowLinkListPage />);

    // Dedicated "no permission" card is shown...
    expect(await screen.findByTestId('shadowlink-no-permission-card')).toBeInTheDocument();
    expect(screen.getByText(/don't have permission to view shadow links/i)).toBeInTheDocument();

    // ...and we do NOT show the generic error card.
    expect(screen.queryByTestId('shadowlink-error-card')).not.toBeInTheDocument();
  });

  test('does not raise an error toast for PermissionDenied (it is expected, not a failure)', async () => {
    const error = new ConnectError('you are not authorized to call this endpoint', Code.PermissionDenied);
    mockedUseListShadowLinksQuery.mockReturnValue(mockQueryResult({ error }));

    renderWithFileRoutes(<ShadowLinkListPage />);

    await screen.findByTestId('shadowlink-no-permission-card');
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('still renders the generic error state (and toasts) for unexpected errors', async () => {
    const error = new ConnectError('boom', Code.Internal);
    mockedUseListShadowLinksQuery.mockReturnValue(mockQueryResult({ error }));

    renderWithFileRoutes(<ShadowLinkListPage />);

    expect(await screen.findByTestId('shadowlink-error-card')).toBeInTheDocument();
    expect(screen.queryByTestId('shadowlink-no-permission-card')).not.toBeInTheDocument();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to load shadowlinks', expect.anything()));
  });
});

const noLinks = () =>
  mockedUseListShadowLinksQuery.mockReturnValue(mockQueryResult({ data: create(ListShadowLinksResponseSchema) }));

describe('whether the ShadowLinkListPage has a Cluster fence tab', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    useClusterFenceStore.setState({ topology: null });
  });

  test.each([
    ['', '/shadowlinks'],
    [', even when linked to the fence tab', '/shadowlinks?tab=source'],
  ])('without the API for this viewer, shows the page as it was, with no tabs%s', async (_label, initialLocation) => {
    mockFence({ available: false });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, { initialLocation, transport: routeLoaderTransport });

    expect(await screen.findByText(CREATE_SHADOW_LINK)).toBeInTheDocument();
    expect(screen.queryByTestId('shadowlinks-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cluster-fence-source-panel-stub')).not.toBeInTheDocument();
  });

  test('a cluster Cloud knows no link reads from opens on its links, and can still be fenced from its tab', async () => {
    const user = userEvent.setup();
    mockFence({ available: true, known: true, phase: 'unfenced' });
    noLinks();
    useClusterFenceStore.setState({
      topology: { clusterName: 'dr', readers: [], sources: {}, resolving: false, readersIncomplete: false },
    });
    const { router } = renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/shadowlinks',
      transport: routeLoaderTransport,
    });

    expect(await screen.findByText(CREATE_SHADOW_LINK)).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-fence-source-panel-stub')).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'links' }));
    await user.click(screen.getByTestId('shadowlinks-tab-source'));
    expect(await screen.findByTestId('cluster-fence-source-panel-stub')).toBeInTheDocument();
  });

  test('without Cloud’s list of links that read from it, any cluster that can be fenced gets the fence tab', async () => {
    mockFence({ available: true, known: true, phase: 'unfenced' });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByTestId('shadowlinks-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-fence-source-panel-stub')).toBeInTheDocument();
  });

  test.each([
    ['that hasn’t failed over, so it’s only a shadow', ShadowLinkState.ACTIVE],
    ['that failed over', ShadowLinkState.FAILED_OVER],
  ])('a cluster with a shadow link of its own %s has the fence tab, and opens on its links', async (_label, state) => {
    mockFence({ available: true, known: true, phase: 'unfenced' });
    mockedUseListShadowLinksQuery.mockReturnValue(
      mockQueryResult({
        data: create(ListShadowLinksResponseSchema, {
          shadowLinks: [{ name: 'orders-dr', bootstrapServers: [], state }],
        }),
      })
    );
    const { router } = renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/shadowlinks',
      transport: routeLoaderTransport,
    });

    expect(await screen.findByTestId('shadowlink-row-orders-dr')).toBeInTheDocument();
    expect(screen.getByTestId('shadowlinks-tab-source')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'links' }));
  });

  test('waits for the fence and the topology before choosing a tab', async () => {
    mockFence({ available: true, known: false });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByTestId('shadowlinks-tab-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('shadowlinks-tabs')).not.toBeInTheDocument();
  });

  test('a link to the fence tab keeps it while that’s still being decided', async () => {
    mockFence({ available: true, known: false });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/shadowlinks?tab=source',
      transport: routeLoaderTransport,
    });

    expect(await screen.findByTestId('cluster-fence-source-panel-stub')).toBeInTheDocument();
  });
});

describe('the tab the ShadowLinkListPage opens on', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    useClusterFenceStore.setState({ topology: null });
  });

  test('a fenced cluster opens on its fence, in a tab called Cluster fence, and writes the tab into the URL', async () => {
    mockFence({ available: true, known: true, phase: 'fenced' });
    noLinks();
    const { router } = renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/shadowlinks',
      transport: routeLoaderTransport,
    });

    expect(await screen.findByTestId('cluster-fence-source-panel-stub')).toBeInTheDocument();
    expect(screen.getByTestId('shadowlinks-tab-source')).toHaveTextContent('Cluster fence');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'source' }));
  });

  test('a cluster Cloud knows links read from opens on its fence', async () => {
    mockFence({ available: true, known: true, phase: 'unfenced' });
    noLinks();
    useClusterFenceStore.setState({
      topology: {
        clusterName: 'prod',
        readers: [{ linkName: 'orders-dr', shadowClusterId: 'dr', shadowClusterName: 'dr', authentication: 'none' }],
        sources: {},
        resolving: false,
        readersIncomplete: false,
      },
    });
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByTestId('cluster-fence-source-panel-stub')).toBeInTheDocument();
  });

  test('a cluster with shadow linking off, which a source doesn’t need, opens on its fence', async () => {
    const user = userEvent.setup();
    mockFence({ available: true, known: true, phase: 'unfenced' });
    mockedUseListShadowLinksQuery.mockReturnValue(
      mockQueryResult({
        error: new ConnectError('Cluster link feature is disabled', Code.FailedPrecondition),
      })
    );
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByTestId('cluster-fence-source-panel-stub')).toBeInTheDocument();
    await user.click(screen.getByTestId('shadowlinks-tab-links'));
    expect(await screen.findByTestId('shadowlink-feature-disabled-card')).toBeInTheDocument();
  });

  test('keeps its tabs while a list that failed loads again', async () => {
    mockFence({ available: true, known: true, phase: 'unfenced' });
    // A failed query that fetches again starts over with no data and no error.
    mockedUseListShadowLinksQuery.mockReturnValue(mockQueryResult({ isLoading: true, isFetched: true }));
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByTestId('shadowlinks-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-fence-source-panel-stub')).toBeInTheDocument();
  });

  test('doesn’t pull the user back once the router has moved on to another page', async () => {
    mockFence({ available: true, known: true, phase: 'fenced' });
    noLinks();
    const { router } = renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/topics',
      transport: routeLoaderTransport,
    });

    // The page has rendered and its effects have run; a memory history records a push at once.
    expect(await screen.findByTestId('cluster-fence-source-panel-stub')).toBeInTheDocument();
    expect(router.history.location.pathname).toBe('/topics');
  });

  test('a fenced cluster can’t take a new shadow link, and Create says why', async () => {
    mockFence({ available: false, known: true, phase: 'fenced' });
    mockedUseListShadowLinksQuery.mockReturnValue(mockQueryResult({ data: create(ListShadowLinksResponseSchema) }));
    renderWithFileRoutes(<ShadowLinkListPage />);

    const createButton = await screen.findByTestId('create-shadowlink-button');
    expect(createButton).toBeDisabled();
    expect(screen.getByText('rejects new shadow links', { exact: false })).toBeInTheDocument();
  });
});
