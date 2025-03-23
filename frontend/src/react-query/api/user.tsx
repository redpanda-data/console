import type { PartialMessage } from '@bufbuild/protobuf';
import { useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { ListUsersRequest, type ListUsersResponse } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useListUsersQuery = (
  input?: PartialMessage<ListUsersRequest>,
  options?: QueryOptions<ListUsersRequest, ListUsersResponse, ListUsersResponse>,
) => {
  const listUsersRequest = new ListUsersRequest({
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listUsersResult = useInfiniteQueryWithAllPages(listUsers, listUsersRequest, {
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
  });

  const allRetrievedUsers = listUsersResult?.data?.pages?.flatMap(({ users }) => users);

  return {
    ...listUsersResult,
    data: {
      users: allRetrievedUsers,
    },
  };
};

export const useCreateUserMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(createUser, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [listUsers.service.typeName],
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
