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
 * Pagination contract for useListAigwMCPServersQuery.
 *
 * aigw pages ListMCPServers (default 50, created_at desc), so the hook must
 * walk next_page_token until exhausted. The original single-page read
 * silently hid every server older than the newest page — on a tenant with
 * 82 servers, two month-old servers never appeared in the agent pages
 * unless a name filter shrank the result set under one page.
 */

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import {
  type ListMCPServersRequest,
  ListMCPServersResponseSchema,
  MCPServerSchema,
} from 'protogen/redpanda/api/adp/v1alpha1/mcp_server_pb';
import { listMCPServers } from 'protogen/redpanda/api/adp/v1alpha1/mcp_server-MCPServerService_connectquery';
import { connectQueryWrapper } from 'test-utils';
import { describe, expect, test, vi } from 'vitest';

import { useListAigwMCPServersQuery } from './mcp-servers';

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

const recordRequest = (req: ListMCPServersRequest): RecordedRequest => ({
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
      create(ListMCPServersResponseSchema, {
        mcpServers: names.map((name) => create(MCPServerSchema, { name })),
        nextPageToken: index < pages.length - 1 ? `page-${index + 1}` : '',
      }),
    ])
  );
  const transport = createRouterTransport(({ rpc }) => {
    rpc(listMCPServers, (req) => {
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

describe('useListAigwMCPServersQuery', () => {
  test('walks next_page_token and flattens servers from every page in order', async () => {
    const { wrapper, requests } = makePagedHarness([['newest-a', 'newest-b'], ['middle-c'], ['oldest-d']]);

    const { result } = renderHook(() => useListAigwMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.mcpServers).toHaveLength(4);
    });

    expect(result.current.data.mcpServers.map((s) => s.name)).toEqual(['newest-a', 'newest-b', 'middle-c', 'oldest-d']);
    expect(requests.map((r) => r.pageToken)).toEqual(['', 'page-1', 'page-2']);
  });

  test('leaves page_size unset on every request — the server owns page-size policy', async () => {
    const { wrapper, requests } = makePagedHarness([['a'], ['b']]);

    const { result } = renderHook(() => useListAigwMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.pageSize === 0)).toBe(true);
  });

  test('forwards the filter on every page request', async () => {
    const { wrapper, requests } = makePagedHarness([['servicenow-catalog'], ['servicenow-knowledge']]);

    const { result } = renderHook(() => useListAigwMCPServersQuery({ filter: { nameContains: 'servicenow' } }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.mcpServers.map((s) => s.name)).toEqual(['servicenow-catalog', 'servicenow-knowledge']);
    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.nameContains === 'servicenow')).toBe(true);
  });

  test('issues a single request when the first page is the last', async () => {
    const { wrapper, requests } = makePagedHarness([['only-server']]);

    const { result } = renderHook(() => useListAigwMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(requests).toHaveLength(1);
    expect(result.current.data.mcpServers.map((s) => s.name)).toEqual(['only-server']);
  });

  test('returns an empty list for an empty tenant', async () => {
    const { wrapper, requests } = makePagedHarness([[]]);

    const { result } = renderHook(() => useListAigwMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(requests).toHaveLength(1);
    expect(result.current.data.mcpServers).toEqual([]);
  });

  test('completes a deep walk without dropping or reordering pages', async () => {
    const pages = Array.from({ length: 10 }, (_, index) => [`server-${index}`]);
    const { wrapper, requests } = makePagedHarness(pages);

    const { result } = renderHook(() => useListAigwMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.mcpServers).toHaveLength(10);
    });

    expect(requests).toHaveLength(10);
    expect(result.current.data.mcpServers.map((s) => s.name)).toEqual(pages.flat());
  });

  test('does not fetch when disabled', async () => {
    const { wrapper, requests } = makePagedHarness([['hidden']]);

    const { result } = renderHook(() => useListAigwMCPServersQuery(undefined, { enabled: false }), { wrapper });

    // Give a disabled query a chance to misbehave before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests).toHaveLength(0);
    expect(result.current.data.mcpServers).toEqual([]);
  });

  test('stops the walk and surfaces the error when a later page fails', async () => {
    let calls = 0;
    const transport = createRouterTransport(({ rpc }) => {
      rpc(listMCPServers, (req) => {
        calls += 1;
        if (req.pageToken === '') {
          return create(ListMCPServersResponseSchema, {
            mcpServers: [create(MCPServerSchema, { name: 'first' })],
            nextPageToken: 'page-1',
          });
        }
        throw new ConnectError('backend exploded', Code.Internal);
      });
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListAigwMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // First page + one failed second page; the auto-fetch effect must not
    // retry-loop a failing page.
    expect(calls).toBe(2);
  });

  test('reports loading until the last page has landed, not just the first', async () => {
    let releaseSecondPage: (() => void) | undefined;
    const secondPageGate = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    let calls = 0;
    const transport = createRouterTransport(({ rpc }) => {
      rpc(listMCPServers, async (req) => {
        calls += 1;
        if (req.pageToken === '') {
          return create(ListMCPServersResponseSchema, {
            mcpServers: [create(MCPServerSchema, { name: 'first' })],
            nextPageToken: 'page-1',
          });
        }
        await secondPageGate;
        return create(ListMCPServersResponseSchema, {
          mcpServers: [create(MCPServerSchema, { name: 'second' })],
          nextPageToken: '',
        });
      });
    });
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    try {
      const { result } = renderHook(() => useListAigwMCPServersQuery(), { wrapper });

      // The second page is in flight (gated) — consumers must still see loading,
      // otherwise they render a truncated list as if it were complete.
      await waitFor(() => {
        expect(calls).toBe(2);
      });
      expect(result.current.isLoading).toBe(true);

      releaseSecondPage?.();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.data.mcpServers.map((s) => s.name)).toEqual(['first', 'second']);
    } finally {
      // A failed assertion above must not leave the gate pending — an
      // unresolved in-flight RPC keeps the worker's event loop alive and
      // hangs the run at teardown.
      releaseSecondPage?.();
    }
  });
});
