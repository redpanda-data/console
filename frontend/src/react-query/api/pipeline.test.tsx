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
import { createRouterTransport } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import { ListPipelinesResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { listPipelines } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  ListPipelinesResponseSchema as DataPlaneListPipelinesResponseSchema,
  PipelineSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { connectQueryWrapper } from 'test-utils';
import { describe, expect, test } from 'vitest';

import { useListPipelinesQuery } from './pipeline';

describe('useListPipelinesQuery', () => {
  test('fetches all pages and flattens pipelines into a single array', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, (req) => {
        callCount += 1;
        const pageToken = req.request?.pageToken ?? '';

        if (pageToken === '') {
          return create(ListPipelinesResponseSchema, {
            response: create(DataPlaneListPipelinesResponseSchema, {
              pipelines: [create(PipelineSchema, { id: 'pipeline-1', displayName: 'Pipeline 1' })],
              nextPageToken: 'page2',
            }),
          });
        }
        if (pageToken === 'page2') {
          return create(ListPipelinesResponseSchema, {
            response: create(DataPlaneListPipelinesResponseSchema, {
              pipelines: [create(PipelineSchema, { id: 'pipeline-2', displayName: 'Pipeline 2' })],
              nextPageToken: 'page3',
            }),
          });
        }
        return create(ListPipelinesResponseSchema, {
          response: create(DataPlaneListPipelinesResponseSchema, {
            pipelines: [create(PipelineSchema, { id: 'pipeline-3', displayName: 'Pipeline 3' })],
            nextPageToken: '',
          }),
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListPipelinesQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.pipelines).toHaveLength(3);
    });

    expect(callCount).toBe(3);
    expect(result.current.data.pipelines.map((p) => p.id)).toEqual(['pipeline-1', 'pipeline-2', 'pipeline-3']);
  });

  test('returns all data in a single page when no nextPageToken', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, () => {
        callCount += 1;
        return create(ListPipelinesResponseSchema, {
          response: create(DataPlaneListPipelinesResponseSchema, {
            pipelines: [
              create(PipelineSchema, { id: 'pipeline-1', displayName: 'Pipeline 1' }),
              create(PipelineSchema, { id: 'pipeline-2', displayName: 'Pipeline 2' }),
            ],
            nextPageToken: '',
          }),
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListPipelinesQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.pipelines).toHaveLength(2);
    });

    expect(callCount).toBe(1);
  });

  test('handles empty result', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, () => {
        callCount += 1;
        return create(ListPipelinesResponseSchema, {
          response: create(DataPlaneListPipelinesResponseSchema, {
            pipelines: [],
            nextPageToken: '',
          }),
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListPipelinesQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(callCount).toBe(1);
    expect(result.current.data.pipelines).toHaveLength(0);
  });

  test('stops draining when the server repeats the page token it was given', async () => {
    // Unguarded, this drains forever, appending the same page each round.
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, () => {
        callCount += 1;
        return create(ListPipelinesResponseSchema, {
          response: create(DataPlaneListPipelinesResponseSchema, {
            pipelines: [create(PipelineSchema, { id: 'pipeline-1', displayName: 'pipeline-1' })],
            nextPageToken: 'stuck-token',
          }),
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListPipelinesQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // First page, then the one page that reveals the repeat — and no further.
    expect(callCount).toBe(2);
    expect(result.current.data.pipelines.map((p) => p.id)).toEqual(['pipeline-1']);
  });

  test('stops draining on a token cycle, not just an immediate repeat', async () => {
    // Page A points at B, B back at A. Nothing repeats consecutively, so a guard that only checks the
    // last token would alternate forever.
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, (req) => {
        callCount += 1;
        const pageToken = req.request?.pageToken ?? '';
        return create(ListPipelinesResponseSchema, {
          response: create(DataPlaneListPipelinesResponseSchema, {
            pipelines: [create(PipelineSchema, { id: `pipeline-${pageToken || 'first'}`, displayName: 'cycling' })],
            // '' → token-a, token-a → token-b, token-b → token-a, …
            nextPageToken: pageToken === 'token-a' ? 'token-b' : 'token-a',
          }),
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListPipelinesQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Three calls: '' → token-a → token-b, whose token-a is already spent. The drain stops there.
    expect(callCount).toBe(3);
    expect(result.current.data.pipelines.map((p) => p.id)).toEqual([
      'pipeline-first',
      'pipeline-token-a',
      'pipeline-token-b',
    ]);
  });

  test('deduplicates pipelines a replayed page returns twice', async () => {
    // A dataplane resolving the token by exact id match restarts at page one when that pipeline is
    // deleted mid-drain, so page two repeats page one.
    const page = (ids: string[], nextPageToken: string) =>
      create(ListPipelinesResponseSchema, {
        response: create(DataPlaneListPipelinesResponseSchema, {
          pipelines: ids.map((id) => create(PipelineSchema, { id, displayName: id })),
          nextPageToken,
        }),
      });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, (req) => {
        switch (req.request?.pageToken ?? '') {
          case '':
            return page(['pipeline-1', 'pipeline-2'], 'pipeline-3');
          // The boundary pipeline is gone, so this restarts at the top.
          case 'pipeline-3':
            return page(['pipeline-1', 'pipeline-2'], 'pipeline-4');
          default:
            return page(['pipeline-4', 'pipeline-5'], '');
        }
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListPipelinesQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data.pipelines.map((p) => p.id)).toEqual([
      'pipeline-1',
      'pipeline-2',
      'pipeline-4',
      'pipeline-5',
    ]);
  });
});
