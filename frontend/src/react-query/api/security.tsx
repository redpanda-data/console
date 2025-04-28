import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import {
  listRoleMembers,
  listRoles,
} from 'protogen/redpanda/api/console/v1alpha1/security-SecurityService_connectquery';
import {
  type ListRoleMembersRequest,
  ListRoleMembersRequestSchema,
  type ListRoleMembersResponse,
  type ListRolesRequest,
  ListRolesRequestSchema,
  type ListRolesResponse,
} from 'protogen/redpanda/api/console/v1alpha1/security_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';

export const useListRolesQuery = (
  input?: MessageInit<ListRolesRequest>,
  options?: QueryOptions<GenMessage<ListRolesRequest>, ListRolesResponse>,
) => {
  const listRolesRequest = create(ListRolesRequestSchema, {
    pageToken: '',
    pageSize: MAX_PAGE_SIZE,
    ...input,
  });

  const listRolesResult = useInfiniteQueryWithAllPages(listRoles, listRolesRequest, {
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken,
  });

  const roles = listRolesResult?.data?.pages?.flatMap(({ roles }) => roles);

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
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
    getNextPageParam: (lastPage) => lastPage?.nextPageToken,
  });

  const members = listRoleMembersResult?.data?.pages?.flatMap(({ members }) => members);

  return {
    ...listRoleMembersResult,
    data: {
      members,
    },
  };
};
