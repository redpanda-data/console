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

import { renderHook, waitFor } from '@testing-library/react';
import { config } from 'config';
import { connectQueryWrapper } from 'test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useLegacyListTopicsQuery } from './topic';

// Disable retries so a failing query settles into the error state immediately.
const NO_RETRY = { defaultOptions: { queries: { retry: false } } };

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('useLegacyListTopicsQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('surfaces an error when the topics endpoint returns a non-ok HTTP status with a JSON body', async () => {
    // A 403 with a *valid JSON body* is the dangerous case: response.json() resolves,
    // so without an explicit response.ok check the query settles as a success and the
    // error UI never renders — the user sees 0 topics instead of an auth failure.
    vi.spyOn(config, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'forbidden' }, { status: 403, statusText: 'Forbidden' })
    );

    const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
    const { result } = renderHook(() => useLegacyListTopicsQuery(), { wrapper: queryClientWrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  test('returns topics on a successful response', async () => {
    vi.spyOn(config, 'fetch').mockResolvedValue(
      jsonResponse({ topics: [{ topicName: 'orders', isInternal: false }] }, { status: 200 })
    );

    const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
    const { result } = renderHook(() => useLegacyListTopicsQuery(), { wrapper: queryClientWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.topics).toEqual([{ topicName: 'orders', isInternal: false }]);
  });
});
