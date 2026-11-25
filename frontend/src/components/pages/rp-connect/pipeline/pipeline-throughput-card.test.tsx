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
import { describe, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import {
  DataPointSchema,
  type ExecuteRangeQueryRequest,
  ExecuteRangeQueryResponseSchema,
  ListQueriesResponseSchema,
  QueryMetadataSchema,
  TimeSeriesSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/observability_pb';
import {
  executeRangeQuery,
  listQueries,
} from 'protogen/redpanda/api/dataplane/v1alpha3/observability-ObservabilityService_connectquery';
import React from 'react';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { PipelineThroughputCard } from './pipeline-throughput-card';

rs.mock('runtime-config', () => {
  const actual = rs.requireActual<typeof import('runtime-config')>('runtime-config');
  return {
    ...actual,
    config: {
      jwt: 'test-jwt-token',
    },
    isFeatureFlagEnabled: rs.fn(() => false),
  };
});

// recharts ResponsiveContainer requires measured dimensions; stub to a simple div
function ResponsiveContainerStub({ children }: { children: React.ReactNode }) {
  return <div data-testid="responsive-container">{children}</div>;
}

rs.mock('recharts', () => {
  const actual = rs.requireActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ResponsiveContainerStub,
  };
});

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
  listQueriesMock: ReturnType<typeof rs.fn>;
  executeRangeQueryMock: ReturnType<typeof rs.fn>;
}) {
  return createRouterTransport(({ rpc }) => {
    rpc(listQueries, listQueriesMock);
    rpc(executeRangeQuery, executeRangeQueryMock);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the PipelineThroughputCard', () => {
  test('shows calm unavailable state with retry when range queries error', async () => {
    const listQueriesMock = rs
      .fn()
      .mockReturnValue(createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = rs
      .fn<(request: ExecuteRangeQueryRequest) => ReturnType<typeof createRangeQueryResponse>>()
      .mockImplementation(() => {
        throw new ConnectError('metrics backend unavailable', Code.Internal);
      });

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(
      () => {
        expect(screen.getByText("Throughput metrics aren't available right now")).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  test('shows the unavailable state, not the empty state, when the query catalog fails', async () => {
    const listQueriesMock = rs.fn().mockImplementation(() => {
      throw new ConnectError('metrics service unreachable', Code.Internal);
    });
    const executeRangeQueryMock =
      rs.fn<(request: ExecuteRangeQueryRequest) => ReturnType<typeof createRangeQueryResponse>>();

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(
      () => {
        expect(screen.getByText("Throughput metrics aren't available right now")).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    expect(screen.queryByText('No throughput data yet')).not.toBeInTheDocument();
    expect(executeRangeQueryMock).not.toHaveBeenCalled();
  });

  test('shows empty state when queries return empty results', async () => {
    const listQueriesMock = rs
      .fn()
      .mockImplementation(() => createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = rs
      .fn<(request: ExecuteRangeQueryRequest) => ReturnType<typeof createRangeQueryResponse>>()
      .mockImplementation(() =>
        create(ExecuteRangeQueryResponseSchema, {
          results: [],
        })
      );

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(
      () => {
        expect(screen.getByText('No throughput data yet')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  test('renders refresh button that is clickable without crashing', async () => {
    const user = userEvent.setup();

    const listQueriesMock = rs
      .fn()
      .mockReturnValue(createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = rs
      .fn<(request: ExecuteRangeQueryRequest) => ReturnType<typeof createRangeQueryResponse>>()
      .mockReturnValue(
        create(ExecuteRangeQueryResponseSchema, {
          results: [],
        })
      );

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    // Wait for the component to settle (empty state)
    await waitFor(() => {
      expect(screen.getByText('No throughput data yet')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    // After clicking, the component should still render without errors
    expect(screen.getByText('Throughput')).toBeInTheDocument();
  });

  test('shows empty state when listQueries returns no matching queries', async () => {
    // When listQueries has no connect queries, range queries are disabled (enabled: false),
    // so they never load and never error -- resulting in empty chart data.
    const listQueriesMock = rs.fn().mockReturnValue(createListQueriesResponse([]));

    const executeRangeQueryMock =
      rs.fn<(request: ExecuteRangeQueryRequest) => ReturnType<typeof createRangeQueryResponse>>();

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(() => {
      expect(screen.getByText('No throughput data yet')).toBeInTheDocument();
    });

    // Range queries should never have been called since they're disabled
    expect(executeRangeQueryMock).not.toHaveBeenCalled();
  });

  test('renders chart area when data is returned successfully', async () => {
    const now = Date.UTC(2026, 0, 15, 12);
    const fiveMinAgo = now - 5 * 60 * 1000;

    const listQueriesMock = rs
      .fn()
      .mockReturnValue(createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = rs
      .fn<(request: ExecuteRangeQueryRequest) => ReturnType<typeof createRangeQueryResponse>>()
      .mockImplementation((request) => {
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
    expect(screen.queryByText("Throughput metrics aren't available right now")).not.toBeInTheDocument();
    // Verify the empty state is NOT present
    expect(screen.queryByText('No throughput data yet')).not.toBeInTheDocument();
  });

  test('passes pipeline_id filter in range query params', async () => {
    const listQueriesMock = rs
      .fn()
      .mockReturnValue(createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = rs
      .fn<(request: ExecuteRangeQueryRequest) => ReturnType<typeof createRangeQueryResponse>>()
      .mockReturnValue(
        create(ExecuteRangeQueryResponseSchema, {
          results: [],
        })
      );

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(() => {
      expect(executeRangeQueryMock.mock.calls[0]?.[0]).toMatchObject({
        queryName: 'connect_input_received',
        params: { filters: { pipeline_id: PIPELINE_ID } },
      });
    });

    // Every range query call must include the pipeline_id filter
    for (const call of executeRangeQueryMock.mock.calls) {
      expect(call[0].params?.filters).toStrictEqual({ pipeline_id: PIPELINE_ID });
    }
  });

  test('calls both ingress and egress range queries', async () => {
    const listQueriesMock = rs
      .fn()
      .mockReturnValue(createListQueriesResponse(['connect_input_received', 'connect_output_sent']));

    const executeRangeQueryMock = rs
      .fn<(request: ExecuteRangeQueryRequest) => ReturnType<typeof createRangeQueryResponse>>()
      .mockReturnValue(
        create(ExecuteRangeQueryResponseSchema, {
          results: [],
        })
      );

    const transport = buildTransport({ listQueriesMock, executeRangeQueryMock });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await waitFor(() => {
      expect(executeRangeQueryMock).toHaveBeenCalledTimes(2);
    });

    const queryNames = executeRangeQueryMock.mock.calls.map((call) => call[0].queryName);
    expect(queryNames).toContain('connect_input_received');
    expect(queryNames).toContain('connect_output_sent');
  });
});
