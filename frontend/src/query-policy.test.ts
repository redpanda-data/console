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
import { QueryClient } from '@tanstack/react-query';

import queryClient from './query-client';
import {
  isRetryableQueryError,
  QUERY_CACHE_TIME,
  QUERY_DEFAULTS,
  QUERY_STALE_TIME,
  queryRetryDelay,
} from './query-policy';

it('keeps interactive resource data warm long enough for intent-preloaded navigation', () => {
  const queries = queryClient.getDefaultOptions().queries;

  expect(QUERY_STALE_TIME.resource).toBe(60_000);
  expect(QUERY_CACHE_TIME).toBe(30 * 60_000);
  expect(queries?.staleTime).toBe(QUERY_STALE_TIME.resource);
  expect(queries?.gcTime).toBe(QUERY_CACHE_TIME);
  expect(queries?.refetchOnReconnect).toBe(false);
  expect(queries?.refetchOnWindowFocus).toBe(false);

  const federatedQueries = new QueryClient({ defaultOptions: { queries: QUERY_DEFAULTS } }).getDefaultOptions().queries;
  expect(federatedQueries).toMatchObject({
    gcTime: QUERY_CACHE_TIME,
    staleTime: QUERY_STALE_TIME.resource,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
});

it('retries transient server errors but fails deterministic errors quickly', () => {
  expect(isRetryableQueryError(0, new ConnectError('unavailable', Code.Unavailable))).toBe(true);
  expect(isRetryableQueryError(0, new ConnectError('forbidden', Code.PermissionDenied))).toBe(false);
  expect(isRetryableQueryError(0, new TypeError('Failed to fetch'))).toBe(false);
  expect(queryRetryDelay(0, new ConnectError('unavailable', Code.Unavailable))).toBe(1000);
});
