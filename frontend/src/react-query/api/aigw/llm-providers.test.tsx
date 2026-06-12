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

/**
 * Pagination contract for useListLLMProvidersQuery — same contract as the
 * aigw MCP server list: aigw pages results (default 50, created_at desc),
 * so the hook walks next_page_token until exhausted instead of silently
 * truncating to the newest page.
 */

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import {
  type ListLLMProvidersRequest,
  ListLLMProvidersResponseSchema,
  LLMProviderSchema,
} from 'protogen/redpanda/api/adp/v1alpha1/llm_provider_pb';
import { listLLMProviders } from 'protogen/redpanda/api/adp/v1alpha1/llm_provider-LLMProviderService_connectquery';
import { connectQueryWrapper } from 'test-utils';
import { describe, expect, test, vi } from 'vitest';

import { useListLLMProvidersQuery } from './llm-providers';

// Route aigw queries through the wrapper's test transport.
vi.mock('hooks/use-aigw-transport', async () => {
  const { useTransport } = await import('@connectrpc/connect-query');
  return {
    useAigwTransport: () => useTransport(),
  };
});

type RecordedRequest = {
  pageToken: string;
  pageSize: number;
  nameContains: string | undefined;
};

const recordRequest = (req: ListLLMProvidersRequest): RecordedRequest => ({
  pageToken: req.pageToken,
  pageSize: req.pageSize,
  nameContains: req.filter?.nameContains,
});

/**
 * Serves `pages` in order, keyed by the page token the client must echo back
 * (page N's response carries the token that unlocks page N+1). Records every
 * request for assertions.
 */
const makePagedHarness = (pages: string[][]) => {
  const requests: RecordedRequest[] = [];
  const responseByToken = new Map(
    pages.map((names, index) => [
      index === 0 ? '' : `page-${index}`,
      create(ListLLMProvidersResponseSchema, {
        llmProviders: names.map((name) => create(LLMProviderSchema, { name })),
        nextPageToken: index < pages.length - 1 ? `page-${index + 1}` : '',
      }),
    ])
  );
  const transport = createRouterTransport(({ rpc }) => {
    rpc(listLLMProviders, (req) => {
      requests.push(recordRequest(req));
      const response = responseByToken.get(req.pageToken);
      if (!response) {
        throw new ConnectError(`unexpected page token: ${req.pageToken}`, Code.InvalidArgument);
      }
      return response;
    });
  });
  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
  return { wrapper, requests };
};

describe('useListLLMProvidersQuery', () => {
  test('walks next_page_token and flattens providers from every page in order', async () => {
    const { wrapper, requests } = makePagedHarness([['openai', 'anthropic'], ['google'], ['bedrock']]);

    const { result } = renderHook(() => useListLLMProvidersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.llmProviders).toHaveLength(4);
    });

    expect(result.current.data.llmProviders.map((p) => p.name)).toEqual(['openai', 'anthropic', 'google', 'bedrock']);
    expect(requests.map((r) => r.pageToken)).toEqual(['', 'page-1', 'page-2']);
  });

  test('leaves page_size unset on every request — the server owns page-size policy', async () => {
    const { wrapper, requests } = makePagedHarness([['a'], ['b']]);

    const { result } = renderHook(() => useListLLMProvidersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.pageSize === 0)).toBe(true);
  });

  test('forwards the filter on every page request', async () => {
    const { wrapper, requests } = makePagedHarness([['openai-eu'], ['openai-us']]);

    const { result } = renderHook(() => useListLLMProvidersQuery({ filter: { nameContains: 'openai' } }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.llmProviders.map((p) => p.name)).toEqual(['openai-eu', 'openai-us']);
    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.nameContains === 'openai')).toBe(true);
  });

  test('issues a single request when the first page is the last', async () => {
    const { wrapper, requests } = makePagedHarness([['only-provider']]);

    const { result } = renderHook(() => useListLLMProvidersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(requests).toHaveLength(1);
    expect(result.current.data.llmProviders.map((p) => p.name)).toEqual(['only-provider']);
  });

  test('returns an empty list for an empty tenant', async () => {
    const { wrapper, requests } = makePagedHarness([[]]);

    const { result } = renderHook(() => useListLLMProvidersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(requests).toHaveLength(1);
    expect(result.current.data.llmProviders).toEqual([]);
  });

  test('does not fetch when disabled', async () => {
    const { wrapper, requests } = makePagedHarness([['hidden']]);

    const { result } = renderHook(() => useListLLMProvidersQuery(undefined, { enabled: false }), { wrapper });

    // Give a disabled query a chance to misbehave before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests).toHaveLength(0);
    expect(result.current.data.llmProviders).toEqual([]);
  });

  test('stops the walk and surfaces the error when a later page fails', async () => {
    let calls = 0;
    const transport = createRouterTransport(({ rpc }) => {
      rpc(listLLMProviders, (req) => {
        calls += 1;
        if (req.pageToken === '') {
          return create(ListLLMProvidersResponseSchema, {
            llmProviders: [create(LLMProviderSchema, { name: 'first' })],
            nextPageToken: 'page-1',
          });
        }
        throw new ConnectError('backend exploded', Code.Internal);
      });
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListLLMProvidersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // First page + one failed second page; the auto-fetch effect must not
    // retry-loop a failing page.
    expect(calls).toBe(2);
  });
});
