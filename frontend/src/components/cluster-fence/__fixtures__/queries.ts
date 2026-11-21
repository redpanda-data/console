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

import { create } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  type ListShadowLinksResponse,
  ListShadowLinksResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import {
  type GetClusterFenceStatusResponse,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import type { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';
import type { MessageInit } from 'react-query/react-query.utils';

import { type FenceSummary, UNFENCED_SUMMARY } from '../cluster-fence-model';

const queryResult = <T>(data?: T, error?: ConnectError, dataUpdatedAt?: number) => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } } });
  const observer = new QueryObserver<T, ConnectError>(client, {
    queryKey: ['fixture'],
    enabled: false,
    initialData: data,
    initialDataUpdatedAt: dataUpdatedAt,
  });
  if (error !== undefined) {
    observer.getCurrentQuery().setState({ error, status: 'error' });
    observer.updateResult();
  }
  return observer.getCurrentResult();
};

type FenceStatus = ReturnType<typeof useClusterFenceStatusQuery>;
type FenceStatusOptions = Partial<
  Pick<FenceStatus, 'access' | 'known' | 'blocking' | 'ownCopies' | 'brokers' | 'refetch'>
> & {
  summary?: Partial<FenceSummary>;
  data?: MessageInit<GetClusterFenceStatusResponse>;
  error?: ConnectError;
  dataUpdatedAt?: number;
};

export const fenceStatusFixture = ({
  summary,
  data,
  dataUpdatedAt,
  error,
  ...options
}: FenceStatusOptions = {}): FenceStatus => ({
  ...queryResult(
    data === undefined ? undefined : create(GetClusterFenceStatusResponseSchema, data),
    error,
    dataUpdatedAt
  ),
  available: true,
  known: true,
  unreadable: false,
  access: 'ok',
  ownCopies: [],
  blocking: false,
  brokers: [],
  summary: { ...UNFENCED_SUMMARY, ...summary },
  ...options,
});

export const shadowLinksFixture = (shadowLinks?: MessageInit<ListShadowLinksResponse>['shadowLinks']) =>
  queryResult(shadowLinks === undefined ? undefined : create(ListShadowLinksResponseSchema, { shadowLinks }));
