import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  createRole,
  deleteRole,
  getRole,
  listRoleMembers,
  listRoles,
  updateRoleMembership,
} from 'protogen/redpanda/api/console/v1alpha1/security-SecurityService_connectquery';
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
} from 'protogen/redpanda/api/console/v1alpha1/security_pb';
import {
  type ListRoleMembersRequest as ListRoleMembersRequestDataPlane,
  ListRoleMembersRequestSchema as ListRoleMembersRequestSchemaDataPlane,
  type ListRolesRequest as ListRolesRequestDataPlane,
  ListRolesRequestSchema as ListRolesRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useListRolesQuery = (
  input?: MessageInit<ListRolesRequestDataPlane>,
  options?: QueryOptions<GenMessage<ListRolesRequest>, ListRolesResponse>,
) => {
  const listRolesRequestDataPlane = create(ListRolesRequestSchemaDataPlane, {
    pageToken: '',
    pageSize: MAX_PAGE_SIZE,
    ...input,
  });

   const listRolesRequest = create(ListRolesRequestSchema, {
      request: listRolesRequestDataPlane,
    }) as MessageInit<ListRolesRequest> & Required<Pick<MessageInit<ListRolesRequest>, 'request'>>;

  const listRolesResult = useInfiniteQueryWithAllPages(listRoles, listRolesRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
    getNextPageParam: (lastPage) =>
      lastPage?.response?.nextPageToken
        ? {
            ...listRolesRequestDataPlane,
            pageToken: lastPage.response?.nextPageToken,
          }
        : undefined,
  });

  const roles = listRolesResult?.data?.pages?.flatMap(({ response }) => response?.roles);

  return {
    ...listRolesResult,
    data: {
      roles,
    },
  };
};

export const useListRoleMembersQuery = (
  input?: MessageInit<ListRoleMembersRequestDataPlane>,
  options?: QueryOptions<GenMessage<ListRoleMembersRequest>, ListRoleMembersResponse>,
) => {
  const listRoleMembersRequestDataPlane = create(ListRoleMembersRequestSchemaDataPlane, {
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listRolesMembersRequest = create(ListRoleMembersRequestSchema, {
    request: listRoleMembersRequestDataPlane,
  }) as MessageInit<ListRoleMembersRequest> & Required<Pick<MessageInit<ListRoleMembersRequest>, 'request'>>;

  const listRoleMembersResult = useInfiniteQueryWithAllPages(listRoleMembers, listRolesMembersRequest, {
    pageParamKey: 'request',
    enabled: options?.enabled,
    getNextPageParam: (lastPage) =>
      lastPage?.response?.nextPageToken
        ? {
            ...listRoleMembersRequestDataPlane,
            pageToken: lastPage.response?.nextPageToken,
          }
        : undefined,
  });

  const members = listRoleMembersResult?.data?.pages?.flatMap(({ response }) => response?.members);

  return {
    ...listRoleMembersResult,
    data: {
      members,
    },
  };
};

export const useCreateRoleMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(createRole, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecurityService.method.listRoles,
          cardinality: 'infinite',
        }),
        exact: false,
      });

      showToast({
        id: TOASTS.ROLE.CREATE.SUCCESS,
        resourceName: variables?.role?.name,
        title: 'Role created successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.ROLE.CREATE.ERROR,
        resourceName: variables?.role?.name,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'role',
        }),
        status: 'error',
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

export const useDeleteRoleMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteRole, {
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecurityService.method.listRoles,
          cardinality: 'infinite',
        }),
        exact: false,
      });

      showToast({
        id: TOASTS.ROLE.DELETE.SUCCESS,
        resourceName: variables?.roleName,
        title: 'Role deleted successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.ROLE.DELETE.ERROR,
        resourceName: variables?.roleName,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'delete',
          entity: 'role',
        }),
        status: 'error',
      });
    },
  });
};

export const useUpdateRoleMembershipMutationWithToast = () => {
  const queryClient = useQueryClient();

  return useMutation(updateRoleMembership, {
    onSuccess: async (_data, variables) => {
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

      showToast({
        id: TOASTS.ROLE.UPDATE_MEMBERSHIP.SUCCESS,
        resourceName: variables?.roleName,
        title: 'Role membership updated successfully',
        status: 'success',
      });
    },
    onError: (error, variables) => {
      showToast({
        id: TOASTS.ROLE.UPDATE_MEMBERSHIP.ERROR,
        resourceName: variables?.roleName,
        title: formatToastErrorMessageGRPC({
          error,
          action: 'update',
          entity: 'role membership',
        }),
        status: 'error',
      });
    },
  });
};
