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
import { describe, expect, onTestFinished, rs, test } from '@rstest/core';
import { renderHook, waitFor } from '@testing-library/react';
import {
  type ListUsersRequest,
  ListUsersRequestSchema,
  ListUsersResponse_UserSchema,
  ListUsersResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { connectQueryWrapper } from 'test-utils';

import { useInfiniteQueryWithAllPages } from './use-infinite-query-with-all-pages';

describe('useInfiniteQueryWithAllPages', () => {
  test('fetches all pages automatically', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listUsers, (req) => {
        callCount += 1;
        const pageToken = req.pageToken;

        if (pageToken === '') {
          return create(ListUsersResponseSchema, {
            users: [create(ListUsersResponse_UserSchema, { name: 'user-1' })],
            nextPageToken: 'page2',
          });
        }
        if (pageToken === 'page2') {
          return create(ListUsersResponseSchema, {
            users: [create(ListUsersResponse_UserSchema, { name: 'user-2' })],
            nextPageToken: 'page3',
          });
        }
        return create(ListUsersResponseSchema, {
          users: [create(ListUsersResponse_UserSchema, { name: 'user-3' })],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const request = create(ListUsersRequestSchema, {
      pageToken: '',
      pageSize: 1,
    }) as ListUsersRequest & Required<Pick<ListUsersRequest, 'pageToken'>>;

    const { result } = renderHook(
      () =>
        useInfiniteQueryWithAllPages(listUsers, request, {
          getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
          pageParamKey: 'pageToken',
        }),
      { wrapper }
    );

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.hasNextPage).toBe(false);
      },
      { timeout: 5000 }
    );

    expect(callCount).toBe(3);
    expect(result.current.data?.pages).toHaveLength(3);
  });

  test('stops fetching on error and does not cause infinite loop', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listUsers, (req) => {
        callCount += 1;
        const pageToken = req.pageToken;

        if (pageToken === '') {
          return create(ListUsersResponseSchema, {
            users: [create(ListUsersResponse_UserSchema, { name: 'user-1' })],
            nextPageToken: 'page2',
          });
        }
        throw new Error('API Error');
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const request = create(ListUsersRequestSchema, {
      pageToken: '',
      pageSize: 1,
    }) as ListUsersRequest & Required<Pick<ListUsersRequest, 'pageToken'>>;

    const { result } = renderHook(
      () =>
        useInfiniteQueryWithAllPages(listUsers, request, {
          getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
          pageParamKey: 'pageToken',
        }),
      { wrapper }
    );

    await waitFor(
      () => {
        expect(result.current.isFetching).toBe(false);
        expect(callCount).toBe(2);
      },
      { timeout: 2000, interval: 50 }
    );

    expect(callCount).toBe(2);

    expect(result.current.isError).toBe(true);

    expect(result.current.data?.pages).toHaveLength(1);
  });

  test('does not fetch when disabled', async () => {
    rs.useFakeTimers();
    onTestFinished(() => {
      rs.useRealTimers();
    });
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listUsers, () => {
        callCount += 1;
        return create(ListUsersResponseSchema, {
          users: [],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const request = create(ListUsersRequestSchema, {
      pageToken: '',
      pageSize: 1,
    }) as ListUsersRequest & Required<Pick<ListUsersRequest, 'pageToken'>>;

    renderHook(
      () =>
        useInfiniteQueryWithAllPages(listUsers, request, {
          enabled: false,
          getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
          pageParamKey: 'pageToken',
        }),
      { wrapper }
    );

    await rs.runOnlyPendingTimersAsync();

    expect(callCount).toBe(0);
  });
});
