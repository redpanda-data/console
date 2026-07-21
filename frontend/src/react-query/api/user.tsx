import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ListUsersRequest,
  ListUsersRequestSchema,
  type ListUsersResponse,
  SASLMechanism,
  UserService,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import queryClient from 'query-client';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useListUsersQuery = (
  input?: MessageInit<ListUsersRequest>,
  options?: QueryOptions<GenMessage<ListUsersRequest>, ListUsersResponse>
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
    default:
      return SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256;
  }
};

export const useCreateUserMutation = () => {
  const qc = useQueryClient();

  return useMutation(createUser, {
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: UserService.method.listUsers,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      toast.error(
        formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'user',
        })
      ),
  });
};

export const useUpdateUserMutationWithToast = () => {
  const qc = useQueryClient();

  return useMutation(updateUser, {
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: UserService.method.listUsers,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      toast.error(
        formatToastErrorMessageGRPC({
          error,
          action: 'update',
          entity: 'user',
        })
      ),
  });
};

export const useDeleteUserMutation = () => {
  const qc = useQueryClient();

  return useMutation(deleteUser, {
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: UserService.method.listUsers,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => toast.error(formatToastErrorMessageGRPC({ error, action: 'delete', entity: 'user' })),
  });
};

/**
 * Hook to get a function that invalidates the users cache.
 * Use this after MobX operations that modify users (create, delete).
 */
export const useInvalidateUsersCache = () => {
  const qc = useQueryClient();

  return async () => {
    await qc.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: UserService.method.listUsers,
        cardinality: 'infinite',
      }),
      exact: false,
    });
  };
};

/**
 * Non-hook function to invalidate users cache.
 * Use this in class components or outside of React components.
 */
export const invalidateUsersCache = () =>
  queryClient.invalidateQueries({
    queryKey: createConnectQueryKey({
      schema: UserService.method.listUsers,
      cardinality: 'infinite',
    }),
    exact: false,
  });
