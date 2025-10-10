import {
  type ListRoleBindingsRequest,
  ListRoleBindingsRequestSchema,
  type ListRoleBindingsResponse,
  RoleBindingService,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/role_binding_pb';
import {
  createRoleBinding,
  listRoleBindings,
} from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/iam/v1/role_binding-RoleBindingService_connectquery';
import { writeRoleBindings } from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/iam/v1alpha1/role_binding-RoleBindingService_connectquery';
import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv2';
import { Code } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useListRoleBindingsQuery = (
  input?: ListRoleBindingsRequest,
  options?: QueryOptions<GenMessage<ListRoleBindingsRequest>, ListRoleBindingsResponse>
) => {
  const listRoleBindingsRequest = create(ListRoleBindingsRequestSchema, {
    pageSize: input?.pageSize ?? MAX_PAGE_SIZE,
    pageToken: input?.pageToken ?? '',
    filter: input?.filter,
  });

  return useQuery(listRoleBindings, listRoleBindingsRequest, {
    enabled: options?.enabled,
  });
};

export const useCreateRoleBindingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createRoleBinding, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: RoleBindingService.method.listRoleBindings,
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
        entity: 'role binding',
      });
    },
  });
};

export const useWriteRoleBindingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(writeRoleBindings, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: RoleBindingService.method.listRoleBindings,
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
        entity: 'role binding',
      });
    },
  });
};
