import {
  type ListRoleBindingsRequest_Filter,
  ListRoleBindingsRequestSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/role_binding_pb';
import {
  type GetServiceAccountCredentialsRequest,
  type GetServiceAccountCredentialsResponse,
  type GetServiceAccountRequest,
  type GetServiceAccountResponse,
  type ListServiceAccountsRequest,
  ListServiceAccountsRequestSchema,
  type ListServiceAccountsResponse,
  ServiceAccountService,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/service_account_pb';
import { listRoleBindings } from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/iam/v1/role_binding-RoleBindingService_connectquery';
import {
  createServiceAccount,
  getServiceAccount,
  getServiceAccountCredentials,
  listServiceAccounts,
  rotateServiceAccountSecret,
  updateServiceAccount,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/iam/v1/service_account-ServiceAccountService_connectquery';
import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv2';
import { Code } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  MAX_PAGE_SIZE,
  MEDIUM_LIVED_CACHE_STALE_TIME,
  NO_LIVED_CACHE_STALE_TIME,
  type QueryOptions,
} from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useListServiceAccountsQuery = (
  input?: ListServiceAccountsRequest,
  options?: QueryOptions<GenMessage<ListServiceAccountsRequest>, ListServiceAccountsResponse>
) => {
  const listServiceAccountsRequest = create(ListServiceAccountsRequestSchema, {
    pageSize: input?.pageSize ?? MAX_PAGE_SIZE,
    pageToken: input?.pageToken ?? '',
  });

  return useQuery(listServiceAccounts, listServiceAccountsRequest, {
    enabled: options?.enabled,
    staleTime: MEDIUM_LIVED_CACHE_STALE_TIME,
  });
};

export const useListServiceAccountsWithRoleBindingsQuery = (
  input?: ListServiceAccountsRequest,
  options?: QueryOptions<GenMessage<ListServiceAccountsRequest>, ListServiceAccountsResponse>
) => {
  const listServiceAccountsResult = useListServiceAccountsQuery(input, options);

  const serviceAccounts = listServiceAccountsResult?.data?.serviceAccounts || [];

  const listRoleBindingsRequest = create(ListRoleBindingsRequestSchema, {
    filter: {
      accountIds: serviceAccounts.map((sa) => sa.id),
    } as ListRoleBindingsRequest_Filter,
    pageSize: MAX_PAGE_SIZE,
  });

  const listRoleBindingsResult = useQuery(listRoleBindings, listRoleBindingsRequest, {
    enabled: serviceAccounts.length > 0,
  });

  const roleBindings = listRoleBindingsResult.data?.roleBindings || [];

  return {
    data: serviceAccounts.map((serviceAccount) => ({
      serviceAccount,
      roleBindings: roleBindings.filter((rb) => rb.accountId === serviceAccount.id),
    })),
    isLoading: listServiceAccountsResult.isLoading || listRoleBindingsResult.isLoading,
    isError: listServiceAccountsResult.isError || listRoleBindingsResult.isError,
    error: listServiceAccountsResult.error || listRoleBindingsResult.error,
  };
};

export const useGetServiceAccountQuery = (
  input: GetServiceAccountRequest,
  options?: QueryOptions<GenMessage<GetServiceAccountRequest>, GetServiceAccountResponse>
) =>
  useQuery(getServiceAccount, input, {
    enabled: options?.enabled,
    staleTime: MEDIUM_LIVED_CACHE_STALE_TIME,
  });

export const useGetServiceAccountCredentialsQuery = (
  input: GetServiceAccountCredentialsRequest,
  options?: QueryOptions<GenMessage<GetServiceAccountCredentialsRequest>, GetServiceAccountCredentialsResponse>
) =>
  useQuery(getServiceAccountCredentials, input, {
    enabled: options?.enabled,
    staleTime: NO_LIVED_CACHE_STALE_TIME,
    retry: 1, // Provide quick feedback to the user in case of an error
  });

export const useCreateServiceAccountMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createServiceAccount, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ServiceAccountService.method.listServiceAccounts,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      if (error.code === Code.PermissionDenied) {
        return;
      }

      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'service account',
      });
    },
  });
};

export const useUpdateServiceAccountMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(updateServiceAccount, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ServiceAccountService.method.listServiceAccounts,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ServiceAccountService.method.getServiceAccount,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      if (error.code === Code.PermissionDenied) {
        return;
      }

      return formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'service account',
      });
    },
  });
};

export const useRotateServiceAccountSecretMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(rotateServiceAccountSecret, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ServiceAccountService.method.getServiceAccountCredentials,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      if (error.code === Code.PermissionDenied) {
        return;
      }

      return formatToastErrorMessageGRPC({
        error,
        action: 'rotate',
        entity: 'service account secret',
      });
    },
  });
};
