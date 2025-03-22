import type { PartialMessage } from '@bufbuild/protobuf';
import { useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { createTopic, listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { ListTopicsRequest, type ListTopicsResponse } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useListTopicsQuery = (
  input?: PartialMessage<ListTopicsRequest>,
  options?: QueryOptions<ListTopicsRequest, ListTopicsResponse, ListTopicsResponse>,
) => {
  const listTopicsRequest = new ListTopicsRequest({
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listTopicsResult = useInfiniteQueryWithAllPages(listTopics, listTopicsRequest, {
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
  });

  const allRetrievedTopics = listTopicsResult?.data?.pages?.flatMap(({ topics }) => topics);

  return {
    ...listTopicsResult,
    data: {
      topics: allRetrievedTopics,
    },
  };
};

export const useCreateTopicMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(createTopic, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [listTopics.service.typeName],
        exact: false,
      });

      showToast({
        id: TOASTS.SECRET.UPDATE.SUCCESS,
        resourceName: variables?.topic?.name,
        title: 'Topic created successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.SECRET.CREATE.ERROR,
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
