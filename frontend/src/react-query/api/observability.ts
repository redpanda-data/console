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
import { useQuery } from '@connectrpc/connect-query';
import {
  type ExecuteInstantQueryRequest,
  ExecuteInstantQueryRequestSchema,
  type ExecuteRangeQueryRequest,
  ExecuteRangeQueryRequestSchema,
  type ListQueriesRequest,
  ListQueriesRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/observability_pb';
import {
  executeInstantQuery,
  executeRangeQuery,
  listQueries,
} from 'protogen/redpanda/api/dataplane/v1alpha3/observability-ObservabilityService_connectquery';
import { fastFailRetry, type MessageInit } from 'react-query/react-query.utils';

export const useListQueries = (
  request?: MessageInit<ListQueriesRequest>,
  opts?: { enabled?: boolean; refetchInterval?: number | false }
) => {
  const listQueriesRequest = create(ListQueriesRequestSchema, request || {});
  return useQuery(listQueries, listQueriesRequest, {
    ...opts,
    retry: fastFailRetry,
  });
};

export const useExecuteRangeQuery = (
  request: MessageInit<ExecuteRangeQueryRequest>,
  opts?: { enabled?: boolean; refetchInterval?: number | false }
) => {
  const executeRangeQueryRequest = create(ExecuteRangeQueryRequestSchema, request);
  return useQuery(executeRangeQuery, executeRangeQueryRequest, {
    ...opts,
    retry: fastFailRetry,
  });
};

export const useExecuteInstantQuery = (
  request: MessageInit<ExecuteInstantQueryRequest>,
  opts?: { enabled?: boolean; refetchInterval?: number | false }
) => {
  const executeInstantQueryRequest = create(ExecuteInstantQueryRequestSchema, request);
  return useQuery(executeInstantQuery, executeInstantQueryRequest, {
    ...opts,
    retry: fastFailRetry,
  });
};
