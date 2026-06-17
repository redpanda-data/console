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
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import { ListTopicsResponseSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { connectQueryWrapper } from 'test-utils';
import { describe, expect, test } from 'vitest';

import { useLegacyListTopicsQuery } from './topic';

// Disable retries so a failing query settles into the error state immediately.
const NO_RETRY = { defaultOptions: { queries: { retry: false } } };

describe('useLegacyListTopicsQuery', () => {
  test('maps gRPC topics to the REST-shaped topic on a successful response', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(listTopics, () =>
        create(ListTopicsResponseSchema, {
          topics: [
            {
              name: 'orders',
              internal: false,
              partitionCount: 3,
              replicationFactor: 2,
              cleanupPolicy: 'delete',
              logDirSummary: { totalSizeBytes: 1024n, hint: '', replicaErrors: [] },
            },
          ],
          nextPageToken: '',
        })
      );
    });

    const { wrapper } = connectQueryWrapper(NO_RETRY, transport);
    const { result } = renderHook(() => useLegacyListTopicsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.topics).toEqual([
      {
        topicName: 'orders',
        isInternal: false,
        partitionCount: 3,
        replicationFactor: 2,
        cleanupPolicy: 'delete',
        documentation: 'UNKNOWN',
        logDirSummary: { totalSizeBytes: 1024, replicaErrors: [], hint: '' },
        allowedActions: undefined,
      },
    ]);
  });

  test('surfaces an error when the topics endpoint fails', async () => {
    const transport = createRouterTransport(({ rpc }) => {
      rpc(listTopics, () => {
        throw new ConnectError('forbidden', Code.PermissionDenied);
      });
    });

    const { wrapper } = connectQueryWrapper(NO_RETRY, transport);
    const { result } = renderHook(() => useLegacyListTopicsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ConnectError);
  });
});
