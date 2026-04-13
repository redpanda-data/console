import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { ACLService } from 'protogen/redpanda/api/dataplane/v1/acl_pb';
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
  RoleMembershipSchema,
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
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

const invalidateRolesQueries = async (queryClient: ReturnType<typeof useQueryClient>) => {
  await queryClient.invalidateQueries({
    queryKey: createConnectQueryKey({
      schema: SecurityService.method.listRoles,
      cardinality: 'infinite',
    }),
    exact: false,
  });
};

const invalidateRoleMembersQueries = async (queryClient: ReturnType<typeof useQueryClient>) => {
  await queryClient.invalidateQueries({
    queryKey: createConnectQueryKey({
      schema: SecurityService.method.listRoleMembers,
      cardinality: 'infinite',
    }),
    exact: false,
  });
};

const invalidateRoleDetailQueries = async (queryClient: ReturnType<typeof useQueryClient>) => {
  await queryClient.invalidateQueries({
    queryKey: createConnectQueryKey({
      schema: SecurityService.method.getRole,
      cardinality: 'finite',
    }),
    exact: false,
  });
};

const invalidateAclQueries = async (queryClient: ReturnType<typeof useQueryClient>) => {
  await queryClient.invalidateQueries({
    queryKey: createConnectQueryKey({
      schema: ACLService.method.listACLs,
      cardinality: 'finite',
    }),
    exact: false,
  });
  await queryClient.invalidateQueries({
    queryKey: createConnectQueryKey({
      schema: ACLService.method.listACLs,
      cardinality: 'infinite',
    }),
    exact: false,
  });
};

export const useListRolesQuery = (
  input?: MessageInit<ListRolesRequest>,
  options?: QueryOptions<GenMessage<ListRolesRequest>, ListRolesResponse>
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
  options?: QueryOptions<GenMessage<ListRoleMembersRequest>, ListRoleMembersResponse>
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
    retry: false,
    onSuccess: async () => {
      await invalidateRolesQueries(queryClient);
    },
    onError: (error) =>
      toast.error(
        formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'role',
        })
      ),
  });
};

export const useGetRoleQuery = (
  input: MessageInit<GetRoleRequest>,
  options?: QueryOptions<GenMessage<GetRoleRequest>, GetRoleResponse>
) => {
  const getRoleRequest = create(GetRoleRequestSchema, input);

  return useQuery(getRole, getRoleRequest, {
    enabled: options?.enabled,
  });
};

export const useDeleteRoleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(deleteRole, {
    retry: false,
    onSuccess: async () => {
      await invalidateRolesQueries(queryClient);
      await invalidateRoleMembersQueries(queryClient);
      await invalidateRoleDetailQueries(queryClient);
      await invalidateAclQueries(queryClient);
    },
    onError: (error) =>
      toast.error(
        formatToastErrorMessageGRPC({
          error,
          action: 'delete',
          entity: 'role',
        })
      ),
  });
};

export const useUpdateRoleMembershipMutation = () => {
  const queryClient = useQueryClient();

  const listRoleMembersQueryFilter = {
    queryKey: createConnectQueryKey({
      schema: SecurityService.method.listRoleMembers,
      cardinality: 'infinite',
    }),
    exact: false,
  } as const;

  return useMutation(updateRoleMembership, {
    retry: false,
    onMutate: async (variables) => {
      // Cancel in-flight fetches so they don't overwrite the optimistic data
      await queryClient.cancelQueries(listRoleMembersQueryFilter);

      // Snapshot for rollback on error
      const previousData =
        queryClient.getQueriesData<InfiniteData<ListRoleMembersResponse>>(listRoleMembersQueryFilter);

      const toAdd = new Set((variables.add ?? []).map((m) => m.principal));
      const toRemove = new Set((variables.remove ?? []).map((m) => m.principal));

      queryClient.setQueriesData<InfiniteData<ListRoleMembersResponse>>(listRoleMembersQueryFilter, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page, i) => ({
            ...page,
            members: [
              ...page.members.filter((m) => !toRemove.has(m.principal)),
              // Append new members to the first page only
              ...(i === 0 ? [...toAdd].map((principal) => create(RoleMembershipSchema, { principal })) : []),
            ],
          })),
        };
      });

      return { previousData };
    },

    onSuccess: async () => {
      // Invalidate the roles list (to refresh member counts) and role detail.
      // The listRoleMembers cache already reflects the correct state via the
      // optimistic update in onMutate — invalidating it here would trigger a
      // refetch that may return stale data before the backend catches up.
      await invalidateRolesQueries(queryClient);
      await invalidateRoleDetailQueries(queryClient);
    },

    onError: (error, _variables, context) => {
      // Rollback optimistic update
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error(
        formatToastErrorMessageGRPC({
          error,
          action: 'update',
          entity: 'role membership',
        })
      );
    },
  });
};
