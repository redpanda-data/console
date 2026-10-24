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

import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { config } from 'config';
import { connectQueryWrapper } from 'test-utils';

import { useLegacyListTopicsQuery, useUpdateTopicConfigMutation } from './topic';
import { useApiStore } from '../../state/backend-api';

// Disable retries so a failing query settles into the error state immediately.
const NO_RETRY = { defaultOptions: { queries: { retry: false } } };

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });

afterEach(() => {
  rs.restoreAllMocks();
});

describe('useLegacyListTopicsQuery', () => {
  test('surfaces an error when the topics endpoint returns a non-ok HTTP status with a JSON body', async () => {
    // A 403 with a *valid JSON body* is the dangerous case: response.json() resolves,
    // so without an explicit response.ok check the query settles as a success and the
    // error UI never renders — the user sees 0 topics instead of an auth failure.
    rs.spyOn(config, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'forbidden' }, { status: 403, statusText: 'Forbidden' })
    );

    const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
    const { result } = renderHook(() => useLegacyListTopicsQuery(), { wrapper: queryClientWrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  test('returns topics on a successful response', async () => {
    rs.spyOn(config, 'fetch').mockResolvedValue(
      jsonResponse({ topics: [{ topicName: 'orders', isInternal: false }] }, { status: 200 })
    );

    const { queryClientWrapper } = connectQueryWrapper(NO_RETRY);
    const { result } = renderHook(() => useLegacyListTopicsQuery(), { wrapper: queryClientWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.topics).toEqual([{ topicName: 'orders', isInternal: false }]);
  });
});

function renderUpdatingTopic() {
  const refreshed = Promise.withResolvers<void>();
  const { queryClient, queryClientWrapper } = connectQueryWrapper(NO_RETRY);
  rs.spyOn(useApiStore.getState(), 'changeTopicConfig').mockResolvedValue(undefined);
  const invalidate = rs.spyOn(queryClient, 'invalidateQueries').mockReturnValue(refreshed.promise);
  const hook = renderHook(() => useUpdateTopicConfigMutation(), { wrapper: queryClientWrapper });
  return { ...hook, refreshed, invalidate };
}

test('topic updates remain pending until their configuration cache refresh completes', async () => {
  const { result, refreshed, invalidate } = renderUpdatingTopic();
  let update: Promise<unknown> | undefined;
  act(() => {
    update = result.current.mutateAsync({ topicName: 'orders', configs: [] });
  });
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['topicConfig', 'orders'] }));
  await act(() => undefined);
  expect(result.current.isPending).toBe(true);
  await act(async () => {
    refreshed.resolve();
    await update;
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
