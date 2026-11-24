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
import { Code, ConnectError, createRouterTransport, type MethodImpl } from '@connectrpc/connect';
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
import { renderWithFileRoutes, screen } from 'test-utils';

import { PipelineThroughputCard } from './pipeline-throughput-card';

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    config: {
      jwt: 'test-jwt-token',
    },
    isFeatureFlagEnabled: rs.fn(() => false),
  };
});

rs.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// WARNING: Do not use the Happy DOM chart fixture as a layout check; ResponsiveContainer requires measured dimensions.
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

const INPUT_QUERY = 'connect_input_received';
const OUTPUT_QUERY = 'connect_output_sent';
const METRICS_UNAVAILABLE = "Throughput metrics aren't available right now";
const EMPTY_METRICS = 'No throughput data yet';

function buildTransport({
  catalog = () => createListQueriesResponse([INPUT_QUERY, OUTPUT_QUERY]),
  range = () => createRangeQueryResponse([]),
}: {
  catalog?: MethodImpl<typeof listQueries>;
  range?: MethodImpl<typeof executeRangeQuery>;
} = {}) {
  return createRouterTransport(({ rpc }) => {
    rpc(listQueries, catalog);
    rpc(executeRangeQuery, range);
  });
}

describe('the PipelineThroughputCard', () => {
  it('shows the unavailable state with retry when range queries error', async () => {
    const transport = buildTransport({
      range: () => {
        throw new ConnectError('metrics backend unavailable', Code.Internal);
      },
    });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    expect(await screen.findByText(METRICS_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the unavailable state and does not request ranges if the catalog fails', async () => {
    const requests: ExecuteRangeQueryRequest[] = [];
    const transport = buildTransport({
      catalog: () => {
        throw new ConnectError('metrics service unreachable', Code.Internal);
      },
      range: (request) => {
        requests.push(request);
        return createRangeQueryResponse([]);
      },
    });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    expect(await screen.findByText(METRICS_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_METRICS)).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows empty results and requests fresh metrics when refreshed', async () => {
    const user = userEvent.setup();
    const refreshed = Promise.withResolvers<ExecuteRangeQueryRequest>();
    let initialLoadComplete = false;
    const transport = buildTransport({
      range: (request) => {
        if (initialLoadComplete) {
          refreshed.resolve(request);
        }
        return createRangeQueryResponse([]);
      },
    });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    expect(await screen.findByText(EMPTY_METRICS)).toBeInTheDocument();
    initialLoadComplete = true;

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect((await refreshed.promise).params?.filters).toEqual({ pipeline_id: PIPELINE_ID });
  });

  it('shows empty results without requesting ranges when no metrics match', async () => {
    const requests: ExecuteRangeQueryRequest[] = [];
    const transport = buildTransport({
      catalog: () => createListQueriesResponse([]),
      range: (request) => {
        requests.push(request);
        return createRangeQueryResponse([]);
      },
    });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    expect(await screen.findByText(EMPTY_METRICS)).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('renders the chart area when data is returned successfully', async () => {
    const now = Date.UTC(2026, 0, 15, 12);
    const fiveMinAgo = now - 5 * 60 * 1000;

    const transport = buildTransport({
      range: (request) => {
        const [first, latest] = request.queryName === INPUT_QUERY ? [100, 200] : [80, 150];
        return createRangeQueryResponse([
          { timestamp: fiveMinAgo, value: first },
          { timestamp: now, value: latest },
        ]);
      },
    });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    expect(await screen.findByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.queryByText(METRICS_UNAVAILABLE)).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_METRICS)).not.toBeInTheDocument();
  });

  it('requests ingress and egress for the selected pipeline', async () => {
    const requests: ExecuteRangeQueryRequest[] = [];
    const bothRequested = Promise.withResolvers();
    const transport = buildTransport({
      range: (request) => {
        requests.push(request);
        if (requests.length === 2) {
          bothRequested.resolve(undefined);
        }
        return createRangeQueryResponse([]);
      },
    });

    renderWithFileRoutes(<PipelineThroughputCard pipelineId={PIPELINE_ID} />, { transport });

    await bothRequested.promise;

    expect(requests.map((request) => request.queryName).sort()).toEqual([INPUT_QUERY, OUTPUT_QUERY]);
    for (const request of requests) {
      expect(request.params?.filters).toEqual({ pipeline_id: PIPELINE_ID });
    }
  });
});
