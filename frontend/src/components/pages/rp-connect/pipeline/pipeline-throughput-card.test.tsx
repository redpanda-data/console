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
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
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
    },
    isFeatureFlagEnabled: vi.fn(() => false),
  };
});

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// recharts ResponsiveContainer requires measured dimensions; stub to a simple div
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

import React from 'react';

import { PipelineThroughputCard } from './pipeline-throughput-card';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PIPELINE_ID = 'test-pipeline-123';

function createListQueriesResponse(queryNames: string[]) {
  return create(ListQueriesResponseSchema, {
    queries: queryNames.map((name) =>
      create(QueryMetadataSchema, {
        name,
        description: `${name} metric`,
        unit: 'messages/s',
        filters: [],
        tags: { component: 'redpanda-connect' },
      })
    ),
  });
}

function createRangeQueryResponse(values: { timestamp: number; value: number }[]) {
  return create(ExecuteRangeQueryResponseSchema, {
    results: [
      create(TimeSeriesSchema, {
        name: 'default',
        values: values.map(({ timestamp, value }) =>
          create(DataPointSchema, {
            timestamp: timestampFromMs(timestamp),
            value,
          })
        ),
      }),
    ],
  });
}

function buildTransport({
  listQueriesMock,
  executeRangeQueryMock,
}: {
  listQueriesMock: ReturnType<typeof vi.fn>;
  executeRangeQueryMock: ReturnType<typeof vi.fn>;
}) {
  return createRouterTransport(({ rpc }) => {
    rpc(listQueries, listQueriesMock);
    rpc(executeRangeQuery, executeRangeQueryMock);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineThroughputCard', () => {
  it('shows warning alert when range queries error', async () => {
    const listQueriesMock = vi
      .fn()
      .mockReturnValue(createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = vi.fn().mockImplementation(() => {
      throw new ConnectError('metrics backend unavailable', Code.Internal);
    });

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(
      () => {
        expect(screen.getByText('Failed to load throughput metrics')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it('shows "not available" text when queries return empty results', async () => {
    const listQueriesMock = vi
      .fn()
      .mockImplementation(() => createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = vi.fn().mockImplementation(() =>
      create(ExecuteRangeQueryResponseSchema, {
        results: [],
      })
    );

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(
      () => {
        expect(screen.getByText('Throughput metrics not available')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it('renders refresh button that is clickable without crashing', async () => {
    const user = userEvent.setup();

    const listQueriesMock = vi
      .fn()
      .mockReturnValue(createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = vi.fn().mockReturnValue(
      create(ExecuteRangeQueryResponseSchema, {
        results: [],
      })
    );

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    // Wait for the component to settle (empty state)
    await waitFor(() => {
      expect(screen.getByText('Throughput metrics not available')).toBeInTheDocument();
    });

    // The refresh button contains only a RefreshCcw icon (lucide-refresh-ccw svg).
    // Find all buttons and locate the one with the refresh icon.
    const allButtons = screen.getAllByRole('button');
    const refreshButton = allButtons.find((btn) => btn.querySelector('.lucide-refresh-ccw'));
    if (!refreshButton) {
      throw new Error('Refresh button not found');
    }
    await user.click(refreshButton);

    // After clicking, the component should still render without errors
    expect(screen.getByText('Throughput')).toBeInTheDocument();
  });

  it('shows "not available" when listQueries returns no matching queries', async () => {
    // When listQueries has no connect queries, range queries are disabled (enabled: false),
    // so they never load and never error -- resulting in empty chart data.
    const listQueriesMock = vi.fn().mockReturnValue(createListQueriesResponse([]));

    const executeRangeQueryMock = vi.fn();

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Throughput metrics not available')).toBeInTheDocument();
    });

    // Range queries should never have been called since they're disabled
    expect(executeRangeQueryMock).not.toHaveBeenCalled();
  });

  it('renders chart area when data is returned successfully', async () => {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;

    const listQueriesMock = vi
      .fn()
      .mockReturnValue(createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = vi.fn().mockImplementation((request) => {
      if (request.queryName === 'connect_input_received') {
        return createRangeQueryResponse([
          { timestamp: fiveMinAgo, value: 100 },
          { timestamp: now, value: 200 },
        ]);
      }
      return createRangeQueryResponse([
        { timestamp: fiveMinAgo, value: 80 },
        { timestamp: now, value: 150 },
      ]);
    });

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    // The ChartContainer renders a div with data-slot="chart"
    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    // Verify the warning alert is NOT present
    expect(screen.queryByText('Failed to load throughput metrics')).not.toBeInTheDocument();
    // Verify the empty state is NOT present
    expect(screen.queryByText('Throughput metrics not available')).not.toBeInTheDocument();
  });
});
