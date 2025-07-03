import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  AuthenticationService,
  type GetIdentityRequest,
  GetIdentityRequestSchema,
  type GetIdentityResponse,
  type ListAuthenticationMethodsRequest,
  ListAuthenticationMethodsRequestSchema,
  type ListAuthenticationMethodsResponse,
  type ListConsoleUsersRequest,
  ListConsoleUsersRequestSchema,
  type ListConsoleUsersResponse,
} from 'protogen/redpanda/api/console/v1alpha1/authentication_pb';
import {
  getIdentity,
  listAuthenticationMethods,
  listConsoleUsers,
  loginSaslScram,
} from 'protogen/redpanda/api/console/v1alpha1/authentication-AuthenticationService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useLoginSaslScramMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(loginSaslScram, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AuthenticationService.method.getIdentity,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'authenticate',
        entity: 'user',
      });
    },
  });
};

export const useListAuthenticationMethodsQuery = (
  input?: MessageInit<ListAuthenticationMethodsRequest>,
  options?: QueryOptions<GenMessage<ListAuthenticationMethodsRequest>, ListAuthenticationMethodsResponse>,
) => {
  const listAuthenticationMethodsRequest = create(ListAuthenticationMethodsRequestSchema, {
    ...input,
  });

  return useQuery(listAuthenticationMethods, listAuthenticationMethodsRequest, {
    enabled: options?.enabled,
  });
};

export const useGetIdentityQuery = (
  input?: MessageInit<GetIdentityRequest>,
  options?: QueryOptions<GenMessage<GetIdentityRequest>, GetIdentityResponse>,
) => {
  const getIdentityRequest = create(GetIdentityRequestSchema, {
    ...input,
  });

  return useQuery(getIdentity, getIdentityRequest, {
    enabled: options?.enabled,
  });
};

export const useListConsoleUsersQuery = (
  input?: MessageInit<ListConsoleUsersRequest>,
  options?: QueryOptions<GenMessage<ListConsoleUsersRequest>, ListConsoleUsersResponse>,
) => {
  const listConsoleUsersRequest = create(ListConsoleUsersRequestSchema, {
    ...input,
  });

  return useQuery(listConsoleUsers, listConsoleUsersRequest, {
    enabled: options?.enabled,
  });
};

export const useIsAuthenticated = () => {
  const { data, isLoading } = useGetIdentityQuery();
  return {
    isAuthenticated: !!data?.displayName,
    isLoading,
    user: data,
  };
};
