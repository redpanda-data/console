import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  type GetRoleRequest,
  GetRoleRequestSchema,
  type GetRoleResponse,
  type ListRoleMembersRequest,
  ListRoleMembersRequestSchema,
  type ListRoleMembersResponse,
  type ListRolesRequest,
  ListRolesRequestSchema,
  type ListRolesResponse,
  SecurityService,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import {
  createRole,
  deleteRole,
  getRole,
  listRoleMembers,
  listRoles,
  updateRoleMembership,
} from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useListRolesQuery = (
  input?: MessageInit<ListRolesRequest>,
  options?: QueryOptions<GenMessage<ListRolesRequest>, ListRolesResponse>,
) => {
  const listRolesRequest: ListRolesRequest = create(ListRolesRequestSchema, {
    pageToken: '',
    pageSize: MAX_PAGE_SIZE,
    ...input,
  });

  const listRolesResult = useInfiniteQueryWithAllPages(listRoles, listRolesRequest, {
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
    pageParamKey: 'pageToken',
  });

  const roles = listRolesResult?.data?.pages?.flatMap((response) => (response ? response?.roles : [])) || [];

  return {
    ...listRolesResult,
    data: {
      roles,
    },
  };
};

export const useListRoleMembersQuery = (
  input?: MessageInit<ListRoleMembersRequest>,
  options?: QueryOptions<GenMessage<ListRoleMembersRequest>, ListRoleMembersResponse>,
) => {
  const listRoleMembersRequest = create(ListRoleMembersRequestSchema, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listRoleMembersResult = useInfiniteQueryWithAllPages(listRoleMembers, listRoleMembersRequest, {
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
    pageParamKey: 'pageToken',
  });

  const members = listRoleMembersResult?.data?.pages?.flatMap((response) => response?.members) || [];

  return {
    ...listRoleMembersResult,
    data: {
      members,
    },
  };
};

export const useCreateRoleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createRole, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecurityService.method.listRoles,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'role',
      });
    },
  });
};

export const useGetRoleQuery = (
  input: MessageInit<GetRoleRequest>,
  options?: QueryOptions<GenMessage<GetRoleRequest>, GetRoleResponse>,
) => {
  const getRoleRequest = create(GetRoleRequestSchema, input);

  return useQuery(getRole, getRoleRequest, {
    enabled: options?.enabled,
  });
};

export const useDeleteRoleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteRole, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecurityService.method.listRoles,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'role',
      });
    },
  });
};

export const useUpdateRoleMembershipMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(updateRoleMembership, {
    onSuccess: async () => {
      // Invalidate both role lists and role member lists
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecurityService.method.listRoles,
          cardinality: 'infinite',
        }),
        exact: false,
      });

      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecurityService.method.listRoleMembers,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'role membership',
      });
    },
  });
};
