import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { useMutation as useTanstackMutation, useQuery as useTanstackQuery } from '@tanstack/react-query';
import { config } from 'config';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import {
  type CreateUserRequest,
  type ListUsersRequest,
  ListUsersRequestSchema,
  type ListUsersResponse,
  type ListUsersResponse_User,
  ListUsersResponse_UserSchema,
  SASLMechanism,
  UserService,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import type { GetUsersResponse } from 'state/restInterfaces';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

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
    // transport: myTransportReference,
    schema: listUsers,
    input: listUsersRequest,
    cardinality: 'infinite', // TODO: Check if we need to specify cardinality
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
  // as Required<Pick<MessageInit<ListUsersRequest>, 'pageToken' | '$typeName' | 'pageSize'>>

  const listUsersResult = useInfiniteQueryWithAllPages(listUsers, listUsersRequest, {
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken,
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

/**
 * TODO: Remove once Console v3 is released.
 */
export const getLegacySaslMechanism = (mechanism?: SASLMechanism) => {
  switch (mechanism) {
    case SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256:
      return 'SCRAM-SHA-256';
    case SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512:
      return 'SCRAM-SHA-512';
    default:
      return 'SCRAM-SHA-256';
  }
};

/**
 * We need to use legacy API to create users for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyCreateUserMutationWithToast = () => {
  const queryClient = useQueryClient();

  // TODO: Remove once Console v3 is released.
  const { refetch: refetchLegacyUserList } = useLegacyListUsersQuery();

  return useTanstackMutation({
    mutationFn: async (request: CreateUserRequest) => {
      const legacyRequestBody = {
        username: request.user?.name,
        password: request.user?.password,
        mechanism: getLegacySaslMechanism(request.user?.mechanism),
      };
      const response = await fetch(`${config.restBasePath}/users`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(legacyRequestBody),
      });

      const data = await response.json();

      await queryClient.invalidateQueries({
        queryKey: [UserService.typeName],
        exact: false,
      });

      /**
       * We need to do this to try and update the user list is updated once you create a user with legacy API.
       * It's still not consistent because sometimes the user may be created but won't be returned in the list endpoint until some time.
       * TODO: Remove once Console v3 is released.
       */
      await refetchLegacyUserList();

      return data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [UserService.typeName],
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
      const connectError = ConnectError.from(error);
      showToast({
        id: TOASTS.USER.CREATE.ERROR,
        resourceName: variables?.user?.name,
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
        queryKey: [UserService.typeName],
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
