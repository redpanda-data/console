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

import { Code, ConnectError } from '@connectrpc/connect';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ShadowLinkListPage } from './shadowlink-list-page';

// Mock the data hook so we can drive query state (error / loading / data) directly.
vi.mock('react-query/api/shadowlink', () => ({
  useListShadowLinksQuery: vi.fn(),
}));

// Mock ui-state (mutated in a useEffect for breadcrumbs/title).
vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock toast notifications so we can assert on them.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { renderWithFileRoutes } from 'test-utils';

const mockedUseListShadowLinksQuery = vi.mocked(useListShadowLinksQuery);

const mockQueryResult = (overrides: Partial<ReturnType<typeof useListShadowLinksQuery>>) =>
  ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }) as unknown as ReturnType<typeof useListShadowLinksQuery>;

describe('ShadowLinkListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
