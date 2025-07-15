import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient, useQuery as useTanstackQuery } from '@tanstack/react-query';
import { config } from 'config';
import {
  type ListTopicsRequest,
  ListTopicsRequestSchema,
  type ListTopicsResponse,
  TopicService,
} from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { createTopic, listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import type { GetTopicsResponse } from 'state/restInterfaces';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

interface ListTopicsExtraOptions {
  hideInternalTopics?: boolean;
}

/**
 * We need to use legacy API to list topics for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyListTopicsQuery = (
  input?: MessageInit<ListTopicsRequest>,
  { hideInternalTopics = false }: ListTopicsExtraOptions = {},
) => {
  const listTopicsRequest = create(ListTopicsRequestSchema, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const infiniteQueryKey = createConnectQueryKey({
    schema: listTopics,
    input: listTopicsRequest,
    cardinality: 'infinite',
  });

  const legacyListTopicsResult = useTanstackQuery<GetTopicsResponse>({
    queryKey: infiniteQueryKey,
    queryFn: async () => {
      const response = await fetch(`${config.restBasePath}/topics`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
        },
      });

      return response.json();
    },
  });

  const allRetrievedTopics = legacyListTopicsResult?.data?.topics;

  const topics = hideInternalTopics
    ? allRetrievedTopics?.filter((topic) => !topic.isInternal && !topic.topicName.startsWith('_'))
    : allRetrievedTopics;

  return { ...legacyListTopicsResult, data: { topics } };
};

/**
 * WARNING: Only use once Console v3 is released.
 */
export const useListTopicsQuery = (
  input?: MessageInit<ListTopicsRequest>,
  options?: QueryOptions<GenMessage<ListTopicsRequest>, ListTopicsResponse>,
  { hideInternalTopics = false }: ListTopicsExtraOptions = {},
) => {
  const listTopicsRequest = create(ListTopicsRequestSchema, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listTopicsResult = useInfiniteQueryWithAllPages(listTopics, listTopicsRequest, {
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken,
  });

  const allRetrievedTopics = listTopicsResult?.data?.pages?.flatMap(({ topics }) => topics);

  const topics = hideInternalTopics
    ? allRetrievedTopics?.filter((topic) => !topic.internal && !topic.name.startsWith('_'))
    : allRetrievedTopics;

  return {
    ...listTopicsResult,
    data: {
      topics,
    },
  };
};

export const useCreateTopicMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createTopic, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: TopicService.method.listTopics,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'topic',
      });
    },
  });
};
