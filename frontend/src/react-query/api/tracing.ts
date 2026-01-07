/**
 * Copyright 2025 Redpanda Data, Inc.
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
  GetTraceRequestSchema,
  type ListTracesRequest,
  ListTracesRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import { getTrace, listTraces } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing-TracingService_connectquery';
import type { MessageInit } from 'react-query/react-query.utils';

export const useListTracesQuery = (
  request: MessageInit<ListTracesRequest>,
  opts?: { enabled?: boolean; refetchInterval?: number | false }
) => {
  const listTracesRequest = create(ListTracesRequestSchema, request);
  return useQuery(listTraces, listTracesRequest, opts);
};

export const useGetTraceQuery = (traceId: string | null | undefined, opts?: { enabled?: boolean }) => {
  const getTraceRequest = create(GetTraceRequestSchema, {
    traceId: traceId || '',
  });

  return useQuery(getTrace, getTraceRequest, {
    ...opts,
    enabled: !!traceId && (opts?.enabled ?? true),
  });
};
