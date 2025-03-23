import type { PartialMessage } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { createConnectInfiniteQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { useMutation as useTanstackMutation, useQuery as useTanstackQuery } from '@tanstack/react-query';
import { config } from 'config';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import {
  type CreateUserRequest_User,
  ListUsersRequest,
  type ListUsersResponse,
  ListUsersResponse_User,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import type { GetUsersResponse } from 'state/restInterfaces';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

/**
 * We need to use legacy API to list users for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyListUsersQuery = (
  _input?: PartialMessage<ListUsersRequest>,
  options?: QueryOptions<ListUsersRequest, ListUsersResponse, ListUsersResponse>,
) => {
  const listUsersRequest = new ListUsersRequest({
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
  });

  const infiniteQueryKey = createConnectInfiniteQueryKey(listUsers, listUsersRequest);

  const legacyListUsersResult = useTanstackQuery<GetUsersResponse>({
    // We need to precisely match the query key provided by other parts of connect-query
    queryKey: infiniteQueryKey,
    queryFn: async () => {
      const response = await fetch(`${config.restBasePath}/users`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
        },
      });

      const data = await response.json();

      return data;
    },
    enabled: options?.enabled,
  });

  const users: ListUsersResponse_User[] =
    legacyListUsersResult.data?.users.map(
      (user) =>
        new ListUsersResponse_User({
          name: user,
          mechanism: undefined, // Not reported by legacy API
        }),
    ) ?? [];

  return {
    ...legacyListUsersResult,
    data: {
      users,
    },
  };
};

/**
 * WARNING: Only use once Console v3 is released.
 */
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

/**
 * We need to use legacy API to create users for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyCreateUserMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation({
    mutationFn: async (user: CreateUserRequest_User) => {
      const response = await fetch(`${config.restBasePath}/users`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
        },
        body: JSON.stringify(user),
      });

      const data = await response.json();

      await queryClient.invalidateQueries({
        queryKey: [listUsers.service.typeName],
        exact: false,
      });

      return data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [listUsers.service.typeName],
        exact: false,
      });

      showToast({
        id: TOASTS.USER.CREATE.SUCCESS,
        resourceName: variables?.name,
        title: 'User created successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      const connectError = ConnectError.from(error);
      showToast({
        id: TOASTS.USER.CREATE.ERROR,
        resourceName: variables?.name,
        title: formatToastErrorMessageGRPC({
          error: connectError,
          action: 'create',
          entity: 'user',
        }),
        status: 'error',
      });
    },
  });
};

/**
 * WARNING: Only use once Console v3 is released.
 */
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
