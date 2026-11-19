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
import { describe, expect, test } from '@rstest/core';
import { renderHook, waitFor } from '@testing-library/react';
import { ListPipelinesResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { listPipelines } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  ListPipelinesResponseSchema as DataPlaneListPipelinesResponseSchema,
  PipelineSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { connectQueryWrapper } from 'test-utils';

import { toNameContainsFilter, useListPipelinesQuery } from './pipeline';

const NAME_FILTERED_INPUT = { pageSize: 100, filter: { includeDrafts: true, nameContains: 'Untitled pipeline' } };

describe('useListPipelinesQuery', () => {
  test('shares one cache entry across callers, whatever input each asks for', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, (req) =>
        create(ListPipelinesResponseSchema, {
          response: create(DataPlaneListPipelinesResponseSchema, {
            pipelines: req.request?.filter?.nameContains
              ? [create(PipelineSchema, { id: 'draft-1', displayName: 'Untitled pipeline' })]
              : [
                  create(PipelineSchema, { id: 'pipeline-1', displayName: 'Pipeline 1' }),
                  create(PipelineSchema, { id: 'draft-1', displayName: 'Untitled pipeline' }),
                ],
            nextPageToken: '',
          }),
        })
      );
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(
      () => ({ all: useListPipelinesQuery(), filtered: useListPipelinesQuery(NAME_FILTERED_INPUT) }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.all.data.pipelines.length).toBeGreaterThan(0));

    expect(result.current.filtered.data.pipelines).toEqual(result.current.all.data.pipelines);
  });

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

    expect(callCount).toBe(2);
    expect(result.current.data.pipelines.map((p) => p.id)).toEqual(['pipeline-1']);
  });

  test('stops draining on a token cycle, not just an immediate repeat', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listPipelines, (req) => {
        callCount += 1;
        const pageToken = req.request?.pageToken ?? '';
        return create(ListPipelinesResponseSchema, {
          response: create(DataPlaneListPipelinesResponseSchema, {
            pipelines: [create(PipelineSchema, { id: `pipeline-${pageToken || 'first'}`, displayName: 'cycling' })],
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

    expect(callCount).toBe(3);
    expect(result.current.data.pipelines.map((p) => p.id)).toEqual([
      'pipeline-first',
      'pipeline-token-a',
      'pipeline-token-b',
    ]);
  });

  test('deduplicates pipelines a replayed page returns twice', async () => {
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

// The server validates name_contains against ^[A-Za-z0-9-_ /]+$ and rejects anything
describe('toNameContainsFilter', () => {
  test('passes a name already inside the server pattern through unchanged', () => {
    expect(toNameContainsFilter('Untitled pipeline')).toBe('Untitled pipeline');
    expect(toNameContainsFilter('orders-v2_raw/eu')).toBe('orders-v2_raw/eu');
  });

  test('drops characters the pattern rejects', () => {
    expect(toNameContainsFilter('orders (v2).raw')).toBe('orders v2raw');
    expect(toNameContainsFilter('café')).toBe('caf');
    expect(toNameContainsFilter('a@b#c')).toBe('abc');
  });

  test('returns empty when nothing usable is left, so the filter can be omitted', () => {
    expect(toNameContainsFilter('日本語')).toBe('');
    expect(toNameContainsFilter('')).toBe('');
  });

  test('caps the length at the server maximum', () => {
    expect(toNameContainsFilter('a'.repeat(200))).toHaveLength(128);
  });
});
