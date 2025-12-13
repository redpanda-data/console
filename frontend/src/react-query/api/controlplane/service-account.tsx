import {
  type ListRoleBindingsRequest_Filter,
  ListRoleBindingsRequestSchema,
  type RoleBinding,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/role_binding_pb';
import {
  type CreateServiceAccountRequest,
  type CreateServiceAccountResponse,
  type DeleteServiceAccountRequest,
  type DeleteServiceAccountResponse,
  type GetServiceAccountCredentialsRequest,
  type GetServiceAccountCredentialsResponse,
  type GetServiceAccountRequest,
  type GetServiceAccountResponse,
  type ListServiceAccountsRequest,
  ListServiceAccountsRequestSchema,
  type ListServiceAccountsResponse,
  type RotateServiceAccountSecretRequest,
  type RotateServiceAccountSecretResponse,
  type ServiceAccount,
  ServiceAccountService,
  type UpdateServiceAccountRequest,
  type UpdateServiceAccountResponse,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/service_account_pb';
import { listRoleBindings } from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/iam/v1/role_binding-RoleBindingService_connectquery';
import {
  createServiceAccount,
  deleteServiceAccount,
  getServiceAccount,
  getServiceAccountCredentials,
  listServiceAccounts,
  rotateServiceAccountSecret,
  updateServiceAccount,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/iam/v1/service_account-ServiceAccountService_connectquery';
import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv2';
import type { ConnectError } from '@connectrpc/connect';
import { Code } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { type UseMutationResult, type UseQueryResult, useQueryClient } from '@tanstack/react-query';
import {
  MAX_PAGE_SIZE,
  MEDIUM_LIVED_CACHE_STALE_TIME,
  type MessageInit,
  NO_LIVED_CACHE_STALE_TIME,
  type QueryOptions,
} from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useListServiceAccountsQuery = (
  input?: ListServiceAccountsRequest,
  options?: QueryOptions<GenMessage<ListServiceAccountsRequest>, ListServiceAccountsResponse>
): UseQueryResult<ListServiceAccountsResponse, ConnectError> => {
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
): {
  data: { serviceAccount: ServiceAccount; roleBindings: RoleBinding[] }[];
  isLoading: boolean;
  isError: boolean;
  error: ConnectError | null;
} => {
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
): UseQueryResult<GetServiceAccountResponse, ConnectError> =>
  useQuery(getServiceAccount, input, {
    enabled: options?.enabled,
    staleTime: MEDIUM_LIVED_CACHE_STALE_TIME,
  });

export const useGetServiceAccountCredentialsQuery = (
  input: GetServiceAccountCredentialsRequest,
  options?: QueryOptions<GenMessage<GetServiceAccountCredentialsRequest>, GetServiceAccountCredentialsResponse>
): UseQueryResult<GetServiceAccountCredentialsResponse, ConnectError> =>
  useQuery(getServiceAccountCredentials, input, {
    enabled: options?.enabled,
    staleTime: NO_LIVED_CACHE_STALE_TIME,
    retry: 1, // Provide quick feedback to the user in case of an error
  });

const useInvalidateServiceAccountsList = () => {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: ServiceAccountService.method.listServiceAccounts,
        cardinality: 'finite',
      }),
      exact: false,
    });
  };

  return { invalidate };
};

export const useCreateServiceAccountMutation = (options?: {
  skipInvalidation?: boolean;
}): UseMutationResult<CreateServiceAccountResponse, ConnectError, MessageInit<CreateServiceAccountRequest>> => {
  const { invalidate } = useInvalidateServiceAccountsList();

  return useMutation(createServiceAccount, {
    onSuccess: async () => {
      if (!options?.skipInvalidation) {
        await invalidate();
      }
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

export const useUpdateServiceAccountMutation = (): UseMutationResult<
  UpdateServiceAccountResponse,
  ConnectError,
  MessageInit<UpdateServiceAccountRequest>
> => {
  const queryClient = useQueryClient();
  const { invalidate } = useInvalidateServiceAccountsList();

  return useMutation(updateServiceAccount, {
    onSuccess: async () => {
      await invalidate();
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

export const useRotateServiceAccountSecretMutation = (): UseMutationResult<
  RotateServiceAccountSecretResponse,
  ConnectError,
  MessageInit<RotateServiceAccountSecretRequest>
> => {
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

export const useDeleteServiceAccountMutation = (options?: {
  skipInvalidation?: boolean;
}): UseMutationResult<DeleteServiceAccountResponse, ConnectError, MessageInit<DeleteServiceAccountRequest>> => {
  const { invalidate } = useInvalidateServiceAccountsList();

  return useMutation(deleteServiceAccount, {
    onSuccess: async () => {
      if (!options?.skipInvalidation) {
        await invalidate();
      }
    },
    onError: (error) => {
      if (error.code === Code.PermissionDenied) {
        return;
      }

      return formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'service account',
      });
    },
  });
};
