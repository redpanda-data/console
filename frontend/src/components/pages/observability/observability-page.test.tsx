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
import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { createRouterTransport } from '@connectrpc/connect';
import {
  DataPointSchema,
  ExecuteRangeQueryResponseSchema,
  ListQueriesResponseSchema,
  QueryMetadataSchema,
  TimeSeriesSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/observability_pb';
import {
  executeRangeQuery,
  listQueries,
} from 'protogen/redpanda/api/dataplane/v1alpha3/observability-ObservabilityService_connectquery';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    config: {
      jwt: 'test-jwt-token',
      controlplaneUrl: 'http://localhost:9090',
    },
    isFeatureFlagEnabled: vi.fn(() => false),
    addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
  };
});

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

vi.mock('state/app-global', () => ({
  appGlobal: {
    onRefresh: null,
  },
}));

import ObservabilityPage from './observability-page';

describe('ObservabilityPage', () => {
  test('should render and display content when data loads', async () => {
    const listQueriesResponse = create(ListQueriesResponseSchema, {
      queries: [],
    });

    const listQueriesMock = vi.fn().mockReturnValue(listQueriesResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listQueries, listQueriesMock);
    });

    renderWithFileRoutes(<ObservabilityPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('No metrics queries available at this time.')).toBeInTheDocument();
    });

    expect(listQueriesMock).toHaveBeenCalledTimes(1);
  });

  test('should display metrics queries when data is loaded', async () => {
    const query1 = create(QueryMetadataSchema, {
      name: 'cpu_usage',
      description: 'CPU usage percentage',
      unit: 'percent',
      filters: [],
      tags: {},
    });

    const query2 = create(QueryMetadataSchema, {
      name: 'memory_usage',
      description: 'Memory usage in bytes',
      unit: 'bytes',
      filters: [],
      tags: {},
    });

    const listQueriesResponse = create(ListQueriesResponseSchema, {
      queries: [query1, query2],
    });

    // Create mock time series data
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const mockTimeSeries = create(TimeSeriesSchema, {
      name: 'default',
      values: [
        create(DataPointSchema, {
          timestamp: timestampFromMs(oneHourAgo),
          value: 50.5,
        }),
        create(DataPointSchema, {
          timestamp: timestampFromMs(now),
          value: 75.2,
        }),
      ],
    });

    const listQueriesMock = vi.fn().mockReturnValue(listQueriesResponse);
    const executeRangeQueryMock = vi.fn().mockImplementation((request) => {
      let metadata: typeof query1 | typeof query2 | undefined;
      if (request.queryName === 'cpu_usage') {
        metadata = query1;
      } else if (request.queryName === 'memory_usage') {
        metadata = query2;
      }

      return create(ExecuteRangeQueryResponseSchema, {
        metadata,
        results: [mockTimeSeries],
      });
    });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listQueries, listQueriesMock);
      rpc(executeRangeQuery, executeRangeQueryMock);
    });

    renderWithFileRoutes(<ObservabilityPage />, { transport });

    // Wait for titles to appear
    await waitFor(() => {
      expect(screen.getByText('CPU usage percentage')).toBeInTheDocument();
      expect(screen.getByText('Memory usage in bytes')).toBeInTheDocument();
    });
  });

  test('should display no metrics message when queries array is empty', async () => {
    const listQueriesResponse = create(ListQueriesResponseSchema, {
      queries: [],
    });

    const listQueriesMock = vi.fn().mockReturnValue(listQueriesResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listQueries, listQueriesMock);
    });

    renderWithFileRoutes(<ObservabilityPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('No metrics queries available at this time.')).toBeInTheDocument();
    });
  });

  test('should display error message when query fails', async () => {
    const listQueriesMock = vi.fn().mockImplementation(() => {
      throw new Error('Failed to fetch metrics');
    });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listQueries, listQueriesMock);
    });

    renderWithFileRoutes(<ObservabilityPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Error loading metrics')).toBeInTheDocument();
      expect(screen.getByText('Failed to load observability metrics. Please try again later.')).toBeInTheDocument();
    });
  });
});
