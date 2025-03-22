import type { PartialMessage } from '@bufbuild/protobuf';
import { useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { createTopic, listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { ListTopicsRequest, type ListTopicsResponse } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

const internalTopics = [
  '__consumer_offsets',
  '__redpanda.connect.logs',
  '__redpanda.connect.status',
  '__redpanda.connectors_logs',
  '_internal_connectors_configs',
  '_internal_connectors_offsets',
  '_internal_connectors_status',
  '_redpanda.audit_log',
  '_redpanda_e2e_probe',
  '_schemas',
];

interface ListTopicsExtraOptions {
  includeInternalTopics?: boolean;
}

export const useListTopicsQuery = (
  input?: PartialMessage<ListTopicsRequest>,
  options?: QueryOptions<ListTopicsRequest, ListTopicsResponse, ListTopicsResponse>,
  { includeInternalTopics = false }: ListTopicsExtraOptions = {},
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

  const topics = includeInternalTopics
    ? allRetrievedTopics
    : allRetrievedTopics?.filter((topic) => !internalTopics.includes(topic.name));

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
