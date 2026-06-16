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
import type { TopicDescription } from 'state/rest-interfaces';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { api } from '../../state/backend-api';

type ListTopicsExtraOptions = {
  hideInternalTopics?: boolean;
};

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
            cardinality: 'infinite',
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
