import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import {
  type ListUsersRequest,
  ListUsersRequestSchema,
  type ListUsersResponse,
  SASLMechanism,
  UserService,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useListUsersQuery = (
  input?: MessageInit<ListUsersRequest>,
  options?: QueryOptions<GenMessage<ListUsersRequest>, ListUsersResponse>,
) => {
  const listUsersRequest = create(ListUsersRequestSchema, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listUsersResult = useInfiniteQueryWithAllPages(listUsers, listUsersRequest, {
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
  });

  const allRetrievedUsers = listUsersResult?.data?.pages?.flatMap(({ users }) => users);

  return {
    ...listUsersResult,
    data: {
      users: allRetrievedUsers,
    },
  };
};

export const getSASLMechanism = (saslMechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-512') => {
  switch (saslMechanism) {
    case 'SCRAM-SHA-256':
      return SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256;
    case 'SCRAM-SHA-512':
      return SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512;
  }
};

export const useCreateUserMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(createUser, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: UserService.method.listUsers,
          cardinality: 'infinite',
        }),
        exact: false,
      });

      showToast({
        id: TOASTS.USER.CREATE.SUCCESS,
        resourceName: variables?.user?.name,
        title: 'User created successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.USER.CREATE.ERROR,
        resourceName: variables?.user?.name,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'user',
        }),
        status: 'error',
      });
    },
  });
};
