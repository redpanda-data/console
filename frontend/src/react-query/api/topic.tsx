import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { createTopic, listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import {
  type ListTopicsRequest,
  ListTopicsRequestSchema,
  type ListTopicsResponse,
  TopicService,
} from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

interface ListTopicsExtraOptions {
  hideInternalTopics?: boolean;
}

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

export const useCreateTopicMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(createTopic, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: TopicService.method.listTopics,
          cardinality: 'infinite',
        }),
        exact: false,
      });

      showToast({
        id: TOASTS.TOPIC.CREATE.SUCCESS,
        resourceName: variables?.topic?.name,
        title: 'Topic created successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.TOPIC.CREATE.ERROR,
        resourceName: variables?.topic?.name,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'topic',
        }),
        status: 'error',
      });
    },
  });
};
