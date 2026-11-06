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

import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { screen, waitFor } from '@testing-library/react';

import { ShadowLinkListPage } from './shadowlink-list-page';

// Mock the data hook so we can drive query state (error / loading / data) directly.
rs.mock('react-query/api/shadowlink', () => ({
  useListShadowLinksQuery: rs.fn(),
}));

rs.mock('react-query/api/shadow-box', () => {
  const actual = rs.requireActual<typeof import('react-query/api/shadow-box')>('react-query/api/shadow-box');
  return { ...actual, useShadowBoxStatusQuery: rs.fn() };
});

function MockShadowBoxSourcePanel() {
  return <div data-testid="shadow-box-source-panel-stub" />;
}

rs.mock('components/shadow-box/shadow-box-source-panel', () => ({ ShadowBoxSourcePanel: MockShadowBoxSourcePanel }));

// Mock ui-state (mutated in a useEffect for breadcrumbs/title).
rs.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock toast notifications so we can assert on them.
rs.mock('sonner', () => ({
  toast: {
    success: rs.fn(),
    error: rs.fn(),
  },
}));

import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { useShadowBoxStore } from 'stores/shadow-box-store';
import { renderWithFileRoutes } from 'test-utils';

const mockedUseListShadowLinksQuery = rs.mocked(useListShadowLinksQuery);

const mockQueryResult = (overrides: Partial<ReturnType<typeof useListShadowLinksQuery>>) =>
  ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: rs.fn(),
    ...overrides,
  }) as unknown as ReturnType<typeof useListShadowLinksQuery>;

const CREATE_SHADOW_LINK = /create shadow link/i;

// The /shadowlinks route loader lists the cluster's links whenever the router lands on the page.
const routeLoaderTransport = createRouterTransport(({ rpc }) => {
  rpc(listShadowLinks, () => ({ shadowLinks: [] }));
});

const mockBox = (status: { available: boolean; known?: boolean; phase?: string; isError?: boolean }) =>
  rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
    available: status.available,
    known: status.known ?? false,
    isError: status.isError ?? false,
    blocking: Boolean(status.known) && (status.phase === 'boxing' || status.phase === 'boxed'),
    summary: { phase: status.phase ?? 'unboxed' },
  } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);

describe('the ShadowLinkListPage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mockBox({ available: false });
    useShadowBoxStore.setState({ topology: null });
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
  mockedUseListShadowLinksQuery.mockReturnValue(mockQueryResult({ data: { shadowLinks: [] } as never }));

describe('whether the ShadowLinkListPage has a Cluster fence tab', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    useShadowBoxStore.setState({ topology: null });
  });

  test('without the API for this viewer, shows the page as it was, with no tabs', async () => {
    mockBox({ available: false });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByText(CREATE_SHADOW_LINK)).toBeInTheDocument();
    expect(screen.queryByTestId('shadowlinks-tabs')).not.toBeInTheDocument();
  });

  test('an unfenced cluster no link reads from gets no fence tab', async () => {
    mockBox({ available: true, known: true, phase: 'unboxed' });
    noLinks();
    useShadowBoxStore.setState({
      topology: { clusterName: 'dr', readers: [], sources: {}, resolving: false, readersIncomplete: false },
    });
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByText(CREATE_SHADOW_LINK)).toBeInTheDocument();
    expect(screen.queryByTestId('shadowlinks-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shadow-box-source-panel-stub')).not.toBeInTheDocument();
  });

  test('a cluster that’s only a shadow gets no fence tab, and its URL is left alone', async () => {
    mockBox({ available: true, known: true, phase: 'unboxed' });
    mockedUseListShadowLinksQuery.mockReturnValue(
      mockQueryResult({ data: { shadowLinks: [{ name: 'orders-dr', bootstrapServers: [] }] } as never })
    );
    const { router } = renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/shadowlinks',
      transport: routeLoaderTransport,
    });

    expect(await screen.findByTestId('shadowlink-row-orders-dr')).toBeInTheDocument();
    expect(screen.queryByTestId('shadowlinks-tabs')).not.toBeInTheDocument();
    expect(router.state.location.search).not.toHaveProperty('tab');
  });

  test('waits for the fence and the host before choosing a tab', async () => {
    mockBox({ available: true, known: false });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByTestId('shadowlinks-tab-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('shadowlinks-tabs')).not.toBeInTheDocument();
  });

  test('a link to the fence tab keeps it while that’s still being decided', async () => {
    mockBox({ available: true, known: false });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/shadowlinks?tab=source',
      transport: routeLoaderTransport,
    });

    expect(await screen.findByTestId('shadow-box-source-panel-stub')).toBeInTheDocument();
  });

  test('a link to the fence tab of a cluster without one shows its links', async () => {
    mockBox({ available: false });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/shadowlinks?tab=source',
      transport: routeLoaderTransport,
    });

    expect(await screen.findByText(CREATE_SHADOW_LINK)).toBeInTheDocument();
    expect(screen.queryByTestId('shadow-box-source-panel-stub')).not.toBeInTheDocument();
  });
});

describe('the tab the ShadowLinkListPage opens on', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    useShadowBoxStore.setState({ topology: null });
  });

  test('a fenced cluster opens on its fence, in a tab called Cluster fence', async () => {
    mockBox({ available: true, known: true, phase: 'boxed' });
    noLinks();
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByTestId('shadow-box-source-panel-stub')).toBeInTheDocument();
    expect(screen.getByTestId('shadowlinks-tab-source')).toHaveTextContent('Cluster fence');
  });

  test('a cluster Cloud knows links read from opens on its fence', async () => {
    mockBox({ available: true, known: true, phase: 'unboxed' });
    noLinks();
    useShadowBoxStore.setState({
      topology: {
        clusterName: 'prod',
        readers: [{ linkName: 'orders-dr', shadowClusterId: 'dr', shadowClusterName: 'dr' }],
        sources: {},
        resolving: false,
        readersIncomplete: false,
      },
    });
    renderWithFileRoutes(<ShadowLinkListPage />, { transport: routeLoaderTransport });

    expect(await screen.findByTestId('shadow-box-source-panel-stub')).toBeInTheDocument();
  });

  test('writes the tab it opened on into the URL', async () => {
    mockBox({ available: true, known: true, phase: 'boxed' });
    noLinks();
    const { router } = renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/shadowlinks',
      transport: routeLoaderTransport,
    });

    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'source' }));
  });

  test('doesn’t pull the user back once the router has moved on to another page', async () => {
    mockBox({ available: true, known: true, phase: 'boxed' });
    noLinks();
    const { router } = renderWithFileRoutes(<ShadowLinkListPage />, {
      initialLocation: '/topics',
      transport: routeLoaderTransport,
    });

    // The page has rendered and its effects have run; a memory history records a push at once.
    expect(await screen.findByTestId('shadow-box-source-panel-stub')).toBeInTheDocument();
    expect(router.history.location.pathname).toBe('/topics');
  });

  test('a fenced cluster can’t take a new shadow link, and Create says why', async () => {
    mockBox({ available: false, known: true, phase: 'boxed' });
    mockedUseListShadowLinksQuery.mockReturnValue(mockQueryResult({ data: { shadowLinks: [] } as never }));
    renderWithFileRoutes(<ShadowLinkListPage />);

    const create = await screen.findByTestId('create-shadowlink-button');
    expect(create).toBeDisabled();
    expect(screen.getByText('rejects new shadow links', { exact: false })).toBeInTheDocument();
  });
});
