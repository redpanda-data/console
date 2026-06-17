import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import {
  useQueryClient,
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
} from '@tanstack/react-query';
import {
  type ListTopicsRequest,
  ListTopicsRequestSchema,
  type ListTopicsResponse,
  type ListTopicsResponse_Topic,
  TopicService,
} from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic, listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import {
  MAX_PAGE_SIZE,
  type MessageInit,
  type QueryOptions,
  TOPIC_CONFIG_CACHE_STALE_TIME,
} from 'react-query/react-query.utils';
import { toast } from 'sonner';
import type { Topic, TopicDescription } from 'state/rest-interfaces';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { api } from '../../state/backend-api';

type ListTopicsExtraOptions = {
  hideInternalTopics?: boolean;
};

/**
 * Maps a gRPC `ListTopicsResponse_Topic` to the richer REST-shaped `Topic` consumed across the UI.
 * `documentation` and `allowedActions` are not provided by the gRPC endpoint (they were never part
 * of the REST topic-list response either), so they fall back to their neutral defaults.
 */
const mapListTopicToRest = (topic: ListTopicsResponse_Topic): Topic => ({
  topicName: topic.name,
  isInternal: topic.internal,
  partitionCount: topic.partitionCount,
  replicationFactor: topic.replicationFactor,
  cleanupPolicy: topic.cleanupPolicy,
  documentation: 'UNKNOWN',
  logDirSummary: {
    // total_size_bytes is an int64 → bigint in protobuf-es; the UI works with numbers.
    totalSizeBytes: Number(topic.logDirSummary?.totalSizeBytes ?? 0n),
    replicaErrors:
      topic.logDirSummary?.replicaErrors.map((replicaError) => ({
        brokerId: replicaError.brokerId,
        error: replicaError.error,
      })) ?? null,
    hint: topic.logDirSummary?.hint ?? null,
  },
  allowedActions: undefined,
});

/**
 * Lists topics via the gRPC `TopicService.ListTopics` endpoint and maps the response to the
 * REST-shaped `Topic` the UI consumes. Returns the full topic list (pagination disabled) so callers
 * can paginate and filter client-side, matching the previous REST `/topics` behavior.
 */
export const useLegacyListTopicsQuery = (
  input?: MessageInit<ListTopicsRequest>,
  {
    hideInternalTopics = false,
    staleTime,
    refetchOnWindowFocus,
  }: ListTopicsExtraOptions & { staleTime?: number; refetchOnWindowFocus?: boolean } = {}
) => {
  const listTopicsRequest = create(ListTopicsRequestSchema, {
    // -1 disables server-side pagination so the full topic list is returned.
    pageSize: -1,
    pageToken: '',
    ...input,
  });

  const listTopicsResult = useQuery(listTopics, listTopicsRequest, {
    staleTime,
    refetchOnWindowFocus,
  });

  const allRetrievedTopics = listTopicsResult.data?.topics.map(mapListTopicToRest);

  const topics = hideInternalTopics
    ? allRetrievedTopics?.filter((topic) => !(topic.isInternal || topic.topicName.startsWith('_')))
    : allRetrievedTopics;

  return { ...listTopicsResult, data: { topics } };
};

/**
 * WARNING: Only use once Console v3 is released.
 */
export const useListTopicsQuery = (
  input?: MessageInit<ListTopicsRequest>,
  options?: QueryOptions<GenMessage<ListTopicsRequest>, ListTopicsResponse>,
  { hideInternalTopics = false }: ListTopicsExtraOptions = {}
) => {
  const listTopicsRequest = create(ListTopicsRequestSchema, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listTopicsResult = useQuery(listTopics, listTopicsRequest, {
    enabled: options?.enabled,
  });

  const allRetrievedTopics = listTopicsResult?.data?.topics;

  const filteredTopics = hideInternalTopics
    ? allRetrievedTopics?.filter((topic) => !(topic.internal || topic.name.startsWith('_')))
    : allRetrievedTopics;

  return {
    ...listTopicsResult,
    data: {
      topics: filteredTopics,
    },
  };
};

export const useCreateTopicMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createTopic, {
    onSuccess: async () => {
      await Promise.all([
        api.refreshTopics(true),
        queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: TopicService.method.listTopics,
            cardinality: 'finite',
          }),
          exact: false,
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'topic',
        })
      );
    },
  });
};

/**
 * React Query hook to fetch topic configuration
 */
export const useTopicConfigQuery = (topicName: string, enabled = true) => {
  return useTanstackQuery<TopicDescription | null>({
    queryKey: ['topicConfig', topicName],
    queryFn: async () => {
      await api.refreshTopicConfig(topicName, true);
      return api.topicConfig.get(topicName) || null;
    },
    enabled: enabled && !!topicName,
    staleTime: TOPIC_CONFIG_CACHE_STALE_TIME,
    retry: (failureCount, error) => {
      // Don't retry on authorization errors
      if (error && typeof error === 'object' && 'statusText' in error) {
        return false;
      }
      return failureCount < 2;
    },
  });
};

/**
 * Hook to manage topic configuration updates with React Query
 */
export const useUpdateTopicConfigMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation({
    mutationFn: async ({
      topicName,
      configs,
    }: {
      topicName: string;
      configs: Array<{ key: string; op: 'SET' | 'DELETE'; value?: string }>;
    }) => {
      await api.changeTopicConfig(topicName, configs);
      return { topicName, configs };
    },
    onSuccess: (data) => {
      // Invalidate the specific topic config to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: ['topicConfig', data.topicName],
      });
    },
  });
};
