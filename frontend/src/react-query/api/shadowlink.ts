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
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import type { ConnectError } from '@connectrpc/connect';
import {
  createConnectQueryKey,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  type CreateShadowLinkResponseSchema,
  type GetShadowLinkRequest,
  GetShadowLinkRequestSchema,
  type GetShadowMetricsRequest,
  GetShadowMetricsRequestSchema,
  type GetShadowMetricsResponse,
  type ListShadowLinksRequest,
  ListShadowLinksRequestSchema,
  type ListShadowLinkTopicsRequest,
  ListShadowLinkTopicsRequestSchema,
  type ListShadowLinkTopicsResponseSchema,
  type UpdateShadowLinkResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import {
  createShadowLink,
  deleteShadowLink,
  getShadowLink,
  getShadowMetrics,
  listShadowLinks,
  listShadowLinkTopics,
  updateShadowLink,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { failOver } from 'protogen/redpanda/api/dataplane/v1alpha3/shadowlink-ShadowLinkService_connectquery';
import type {
  CreateShadowLinkRequestSchema,
  UpdateShadowLinkRequestSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

/**
 * Hook to list all shadow links
 */
export const useListShadowLinksQuery = (request: MessageInit<ListShadowLinksRequest>, opts?: { enabled: boolean }) => {
  const listShadowLinksRequest = create(ListShadowLinksRequestSchema, request);

  return useQuery(listShadowLinks, listShadowLinksRequest, opts && { enabled: opts?.enabled });
};

export const useGetShadowLinkQuery = (request: MessageInit<GetShadowLinkRequest>) => {
  const getShadowLinkRequest = create(GetShadowLinkRequestSchema, request);

  return useQuery(getShadowLink, getShadowLinkRequest);
};

export const useGetShadowMetricsQuery = (
  request: MessageInit<GetShadowMetricsRequest>,
  options?: QueryOptions<GenMessage<GetShadowMetricsResponse>, GetShadowMetricsResponse>
) => {
  const getShadowMetricsRequest = create(GetShadowMetricsRequestSchema, request);

  return useQuery(getShadowMetrics, getShadowMetricsRequest, options);
};

export const useListShadowTopicQuery = (request: MessageInit<ListShadowLinkTopicsRequest>) => {
  const listShadowTopicsRequest = create(ListShadowLinkTopicsRequestSchema, request);

  return useQuery(listShadowLinkTopics, listShadowTopicsRequest);
};

export const useListShadowTopicInfiniteQuery = (
  request: MessageInit<ListShadowLinkTopicsRequest>,
  options?: Partial<
    UseInfiniteQueryOptions<
      typeof ListShadowLinkTopicsRequestSchema,
      typeof ListShadowLinkTopicsResponseSchema,
      'pageToken'
    >
  >
) => {
  const baseRequest = create(ListShadowLinkTopicsRequestSchema, {
    pageToken: '',
    ...request,
  });

  return useInfiniteQuery(listShadowLinkTopics, baseRequest, {
    getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
    pageParamKey: 'pageToken',
    ...options,
  });
};

export const useInvalidateShadowLinkList = () => {
  const queryClient = useQueryClient();
  const invalid = async () => {
    await queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: listShadowLinks,
        cardinality: 'finite',
      }),
      exact: false,
    });
  };

  return {
    invalid,
  };
};

/**
 * Hook to create a new shadow link
 */
export const useCreateShadowLinkMutation = (
  transportOptions?: UseMutationOptions<typeof CreateShadowLinkRequestSchema, typeof CreateShadowLinkResponseSchema>
) => {
  const { invalid } = useInvalidateShadowLinkList();

  return useMutation(createShadowLink, {
    onSettled: async (_, error) => {
      if (!error) {
        await invalid();
      }
    },
    ...transportOptions,
  });
};

/**
 * Hook to update an existing shadow link
 */
export const useUpdateShadowLinkMutation = (
  transportOptions?: UseMutationOptions<typeof UpdateShadowLinkRequestSchema, typeof UpdateShadowLinkResponseSchema>
) => {
  const { invalid } = useInvalidateShadowLinkList();

  return useMutation(updateShadowLink, {
    onSettled: async (_, error) => {
      if (!error) {
        await invalid();
      }
    },
    ...transportOptions,
  });
};

/**
 * Hook to delete a shadow link
 */
export const useDeleteShadowLinkMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: ConnectError) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation(deleteShadowLink, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listShadowLinks,
          cardinality: 'finite',
        }),
        exact: false,
      });
      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
};

/**
 * Hook to failover a shadow link
 */
export const useFailoverShadowLinkMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: ConnectError) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation(failOver, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listShadowLinks,
          cardinality: 'finite',
        }),
        exact: false,
      });
      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
};
