import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient, useQuery as useTanstackQuery } from '@tanstack/react-query';
import { config } from 'config';
import {
  type ListUsersRequest,
  ListUsersRequestSchema,
  type ListUsersResponse,
  type ListUsersResponse_User,
  ListUsersResponse_UserSchema,
  SASLMechanism,
  UserService,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { createUser, listUsers, updateUser } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import type { GetUsersResponse } from 'state/restInterfaces';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

/**
 * We need to use legacy API to list users for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyListUsersQuery = (
  _input?: MessageInit<ListUsersRequest>,
  options?: QueryOptions<GenMessage<ListUsersRequest>, ListUsersResponse>,
) => {
  const listUsersRequest = create(ListUsersRequestSchema, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
  });

  const infiniteQueryKey = createConnectQueryKey({
    schema: listUsers,
    input: listUsersRequest,
    cardinality: 'infinite',
  });

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
    legacyListUsersResult.data?.users.map((user) =>
      create(ListUsersResponse_UserSchema, {
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
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
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

export const useCreateUserMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createUser, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: UserService.method.listUsers,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'user',
      });
    },
  });
};

export const useUpdateUserMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(updateUser, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: UserService.method.listUsers,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'user',
      });
    },
  });
};
