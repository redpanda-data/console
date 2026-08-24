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

export const QUERY_STALE_TIME = {
  immediate: 0,
  resource: 60_000,
  search: 30_000,
  metrics: 2 * 60_000,
  catalog: Number.POSITIVE_INFINITY,
} as const;

export const QUERY_CACHE_TIME = 30 * 60_000;

const MAX_SERVER_RETRIES = 3;

export function isRetryableQueryError(failureCount: number, error: Error): boolean {
  if (!(error instanceof ConnectError)) {
    return false;
  }
  if (failureCount >= MAX_SERVER_RETRIES) {
    return false;
  }
  return error.code === Code.Internal || error.code === Code.Unknown || error.code === Code.Unavailable;
}

export function queryRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 30_000);
}

export const QUERY_DEFAULTS = {
  staleTime: QUERY_STALE_TIME.resource,
  gcTime: QUERY_CACHE_TIME,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
  retry: isRetryableQueryError,
  retryDelay: queryRetryDelay,
} as const;
