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
import {
  type ListRoleMembersRequest as ListRoleMembersRequestDataPlane,
  ListRoleMembersRequestSchema as ListRoleMembersRequestSchemaDataPlane,
  type ListRolesRequest as ListRolesRequestDataPlane,
  ListRolesRequestSchema as ListRolesRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { MAX_PAGE_SIZE, type MessageInit, type QueryOptions } from 'react-query/react-query.utils';
import { useInfiniteQueryWithAllPages } from 'react-query/use-infinite-query-with-all-pages';

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
