import type { PartialMessage } from '@bufbuild/protobuf';
import {
  listRoleMembers,
  listRoles,
} from 'protogen/redpanda/api/console/v1alpha1/security-SecurityService_connectquery';
import {
  ListRoleMembersRequest,
  type ListRoleMembersResponse,
  ListRolesRequest,
  type ListRolesResponse,
} from 'protogen/redpanda/api/console/v1alpha1/security_pb';
import { MAX_PAGE_SIZE, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';

export const useListRolesQuery = (
  input?: PartialMessage<ListRolesRequest>,
  options?: QueryOptions<ListRolesRequest, ListRolesResponse, ListRolesResponse>,
) => {
  const listRolesRequest = new ListRolesRequest({
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listRolesResult = useInfiniteQueryWithAllPages(listRoles, listRolesRequest, {
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
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
  input?: PartialMessage<ListRoleMembersRequest>,
  options?: QueryOptions<ListRoleMembersRequest, ListRoleMembersResponse, ListRoleMembersResponse>,
) => {
  const listRoleMembersRequest = new ListRoleMembersRequest({
    pageSize: MAX_PAGE_SIZE,
    pageToken: '',
    ...input,
  });

  const listRoleMembersResult = useInfiniteQueryWithAllPages(listRoleMembers, listRoleMembersRequest, {
    pageParamKey: 'pageToken',
    enabled: options?.enabled,
  });

  const members = listRoleMembersResult?.data?.pages?.flatMap(({ members }) => members);

  return {
    ...listRoleMembersResult,
    data: {
      members,
    },
  };
};
