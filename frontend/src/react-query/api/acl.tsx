import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, type UseMutationOptions, useMutation, useQuery } from '@connectrpc/connect-query';
import {
  useQueryClient,
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
} from '@tanstack/react-query';
import { config } from 'config';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  ACLService,
  type CreateACLRequest,
  DeleteACLsRequestSchema,
  type DeleteACLsResponseSchema,
  type ListACLsRequest,
  ListACLsRequestSchema,
  type ListACLsResponse,
  ListACLsResponse_PolicySchema,
  ListACLsResponse_ResourceSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { createACL, deleteACLs, listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import type {
  AclStrOperation,
  AclStrResourcePatternType,
  AclStrResourceType,
  GetAclOverviewResponse,
} from 'state/restInterfaces';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import {
  type AclDetail,
  calculateACLDifference,
  convertRulesToCreateACLRequests,
  getAclFromAclListResponse,
  getIdFromCreateACLRequest,
  type Rule,
  type SharedConfig,
} from '../../components/pages/acls/new-acl/ACL.model';

/**
 * TODO: Remove once Console v3 is released.
 */
const getACLOperationLegacy = (operation: AclStrOperation) => {
  switch (operation) {
    case 'Unknown':
      return ACL_Operation.UNSPECIFIED;
    case 'Any':
      return ACL_Operation.ANY;
    case 'All':
      return ACL_Operation.ALL;
    case 'Read':
      return ACL_Operation.READ;
    case 'Write':
      return ACL_Operation.WRITE;
    case 'Create':
      return ACL_Operation.CREATE;
    case 'Delete':
      return ACL_Operation.DELETE;
    case 'Alter':
      return ACL_Operation.ALTER;
    case 'Describe':
      return ACL_Operation.DESCRIBE;
    case 'ClusterAction':
      return ACL_Operation.CLUSTER_ACTION;
    case 'DescribeConfigs':
      return ACL_Operation.DESCRIBE_CONFIGS;
    case 'AlterConfigs':
      return ACL_Operation.ALTER_CONFIGS;
    case 'IdempotentWrite':
      return ACL_Operation.IDEMPOTENT_WRITE;
  }
};

/**
 * TODO: Remove once Console v3 is released.
 */
const getACLResourceTypeLegacy = (resourceType: AclStrResourceType) => {
  switch (resourceType) {
    case 'Unknown':
      return ACL_ResourceType.UNSPECIFIED;
    case 'Any':
      return ACL_ResourceType.ANY;
    case 'Topic':
      return ACL_ResourceType.TOPIC;
    case 'Group':
      return ACL_ResourceType.GROUP;
    case 'Cluster':
      return ACL_ResourceType.CLUSTER;
    case 'TransactionalID':
      return ACL_ResourceType.TRANSACTIONAL_ID;
    case 'DelegationToken':
      return ACL_ResourceType.DELEGATION_TOKEN;
    case 'RedpandaRole':
      return ACL_ResourceType.USER; // TODO: Check if this mapping is correct
  }
};

/**
 * TODO: Remove once Console v3 is released.
 */
const getACLResourcePatternTypeLegacy = (resourcePatternType: AclStrResourcePatternType) => {
  switch (resourcePatternType) {
    case 'Unknown':
      return ACL_ResourcePatternType.UNSPECIFIED;
    case 'Any':
      return ACL_ResourcePatternType.ANY;
    case 'Match':
      return ACL_ResourcePatternType.MATCH;
    case 'Literal':
      return ACL_ResourcePatternType.LITERAL;
    case 'Prefixed':
      return ACL_ResourcePatternType.PREFIXED;
  }
};

/**
 * We need to use legacy API to list ACLs for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyListACLsQuery = (
  input?: MessageInit<ListACLsRequest>,
  options?: QueryOptions<GenMessage<ListACLsRequest>, ListACLsResponse>,
) => {
  const listACLsRequest = create(ListACLsRequestSchema, {
    ...input,
  });

  const infiniteQueryKey = createConnectQueryKey({
    // transport: myTransportReference,
    schema: listACLs,
    input: listACLsRequest,
    cardinality: 'finite', // There is no pagination for this request, so we can just use regular finite connect query key.
  });

  const legacyListACLsResult = useTanstackQuery<GetAclOverviewResponse>({
    // We need to precisely match the query key provided by other parts of connect-query
    queryKey: infiniteQueryKey,
    queryFn: async () => {
      const response = await fetch(`${config.restBasePath}/acls`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
        },
      });

      const data = await response.json();

      return data;
    },
    enabled: options?.enabled,
  });

  const allRetrievedACLs =
    legacyListACLsResult.data?.aclResources.map((aclResource) =>
      create(ListACLsResponse_ResourceSchema, {
        resourceType: getACLResourceTypeLegacy(aclResource.resourceType),
        resourceName: aclResource.resourceName,
        resourcePatternType: getACLResourcePatternTypeLegacy(aclResource.resourcePatternType),
        acls: aclResource.acls.map((acl) =>
          create(ListACLsResponse_PolicySchema, {
            principal: acl.principal,
            host: acl.host,
            operation: getACLOperationLegacy(acl.operation),
          }),
        ),
      }),
    ) ?? [];

  return {
    ...legacyListACLsResult,
    data: {
      ...legacyListACLsResult.data,
      aclResources: allRetrievedACLs,
    },
  };
};

/**
 * WARNING: Only use once Console v3 is released.
 */
export const useListACLsQuery = (
  input?: MessageInit<ListACLsRequest>,
  options?: QueryOptions<GenMessage<ListACLsRequest>, ListACLsResponse>,
) => {
  const listACLsRequest = create(ListACLsRequestSchema, {
    ...input,
  });

  // There is no pagination for this request, so we use regular useQuery
  const listACLsResult = useQuery(listACLs, listACLsRequest, {
    enabled: options?.enabled,
  });

  return {
    ...listACLsResult,
    data: {
      aclResources: listACLsResult?.data?.resources,
    },
  };
};

/**
 * TODO: Remove once Console v3 is released.
 */
const getACLResourceType = (resourceType: ACL_ResourceType) => {
  switch (resourceType) {
    case ACL_ResourceType.UNSPECIFIED:
      return 'Unknown';
    case ACL_ResourceType.ANY:
      return 'Any';
    case ACL_ResourceType.TOPIC:
      return 'Topic';
    case ACL_ResourceType.GROUP:
      return 'Group';
    case ACL_ResourceType.CLUSTER:
      return 'Cluster';
    case ACL_ResourceType.TRANSACTIONAL_ID:
      return 'TransactionalID';
    case ACL_ResourceType.DELEGATION_TOKEN:
      return 'DelegationToken';
    case ACL_ResourceType.USER:
      return 'RedpandaRole'; // Check if this is accurate
  }
};

/**
 * TODO: Remove once Console v3 is released.
 */
const getACLResourcePatternType = (resourcePatternType: ACL_ResourcePatternType) => {
  switch (resourcePatternType) {
    case ACL_ResourcePatternType.UNSPECIFIED:
      return 'Unknown';
    case ACL_ResourcePatternType.ANY:
      return 'Any';
    case ACL_ResourcePatternType.MATCH:
      return 'Match';
    case ACL_ResourcePatternType.LITERAL:
      return 'Literal';
    case ACL_ResourcePatternType.PREFIXED:
      return 'Prefixed';
  }
};

/**
 * TODO: Remove once Console v3 is released.
 */
export const getACLOperation = (operation: ACL_Operation) => {
  switch (operation) {
    case ACL_Operation.UNSPECIFIED:
      return 'Unknown';
    case ACL_Operation.ANY:
      return 'Any';
    case ACL_Operation.ALL:
      return 'All';
    case ACL_Operation.READ:
      return 'Read';
    case ACL_Operation.WRITE:
      return 'Write';
    case ACL_Operation.CREATE:
      return 'Create';
    case ACL_Operation.DELETE:
      return 'Delete';
    case ACL_Operation.ALTER:
      return 'Alter';
    case ACL_Operation.DESCRIBE:
      return 'Describe';
    case ACL_Operation.CLUSTER_ACTION:
      return 'ClusterAction';
    case ACL_Operation.DESCRIBE_CONFIGS:
      return 'DescribeConfigs';
    case ACL_Operation.ALTER_CONFIGS:
      return 'AlterConfigs';
    case ACL_Operation.IDEMPOTENT_WRITE:
      return 'IdempotentWrite';
    case ACL_Operation.CREATE_TOKENS:
      return 'CreateTokens';
    case ACL_Operation.DESCRIBE_TOKENS:
      return 'DescribeTokens';
  }
};

/**
 * TODO: Remove once Console v3 is released.
 */
export const getACLPermissionType = (permissionType: ACL_PermissionType) => {
  switch (permissionType) {
    case ACL_PermissionType.UNSPECIFIED:
      return 'Unknown';
    case ACL_PermissionType.ANY:
      return 'Any';
    case ACL_PermissionType.DENY:
      return 'Deny';
    case ACL_PermissionType.ALLOW:
      return 'Allow';
  }
};

/**
 * We need to use legacy API to create acls for now
 * because of authorization that is only possible with Console v3 and above.
 * TODO: Remove once Console v3 is released.
 */
export const useLegacyCreateACLMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation({
    mutationFn: async (request: CreateACLRequest) => {
      const legacyRequestBody = {
        resourceType: getACLResourceType(request.resourceType),
        resourceName: request.resourceName,
        resourcePatternType: getACLResourcePatternType(request.resourcePatternType),
        principal: request.principal,
        host: request.host,
        operation: getACLOperation(request.operation),
        permissionType: getACLPermissionType(request.permissionType),
      };
      const response = await fetch(`${config.restBasePath}/acls`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(legacyRequestBody),
      });

      const data = await response.json();

      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ACLService.method.listACLs,
          cardinality: 'infinite',
        }),
        exact: false,
      });

      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ACLService.method.listACLs,
          cardinality: 'infinite',
        }),
        exact: false,
      });
    },
    onError: (error) => {
      const connectError = ConnectError.from(error);
      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'create',
        entity: 'acl',
      });
    },
  });
};

/**
 * WARNING: Only use once Console v3 is released.
 */
export const useCreateACLMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createACL, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ACLService.method.listACLs,
          cardinality: 'infinite',
        }),
      });
    },
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'acl',
      });
    },
  });
};

// New ACL implementation

// this method is used from AclTab frontend/src/components/pages/acls/Acl.List.tsx, removed this when that page is migrated.
interface SimpleAcl {
  host: string;
  principal: string;
  principalType: string;
  principalName: string;
  hasAcl: boolean;
}
// this method is used from AclTab frontend/src/components/pages/acls/Acl.List.tsx, removed this when that page is migrated.
export const useListACLAsPrincipalGroups = () => {
  return useQuery(listACLs, {} as ListACLsRequest, {
    select: (response) => {
      const groupsAcl = response.resources.reduce((acc, r) => {
        r.acls.forEach((a) => {
          if (!acc.has(`${a.principal}:${a.host}`)) {
            const [principalType, principalName] = (a.principal ?? '').split(':');
            acc.set(`${a.principal}:${a.host}`, {
              host: a.host,
              principal: a.principal,
              principalType,
              principalName: principalName || '',
              hasAcl: true,
            });
          }
        });
        return acc;
      }, new Map<string, SimpleAcl>());
      return groupsAcl.values().toArray();
    },
  });
};

// New ACL implementation

interface ACLWithId extends CreateACLRequest {
  id: string;
}

const useInvalidateAclsList = () => {
  const queryClient = useQueryClient();

  const invalid = async () => {
    await queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: ACLService,
        cardinality: 'finite',
      }),
    });
  };

  return {
    invalid,
  };
};

export const useDeleteAclMutation = (
  transportOptions?: UseMutationOptions<typeof DeleteACLsRequestSchema, typeof DeleteACLsResponseSchema>,
) => {
  const { invalid } = useInvalidateAclsList();
  return useMutation(deleteACLs, {
    onSettled: async (_, error) => {
      if (!error) {
        await invalid();
      }
    },
    ...transportOptions,
  });
};

export const useUpdateAclMutation = () => {
  const { mutateAsync: createACLMutation } = useMutation(createACL);
  const { mutateAsync: deleteACLMutation } = useMutation(deleteACLs);
  const { invalid } = useInvalidateAclsList();

  const applyUpdates = async (actualRules: Rule[], sharedConfig: SharedConfig, rules: Rule[]) => {
    const currentRules: ACLWithId[] = convertRulesToCreateACLRequests(
      actualRules,
      sharedConfig.principal,
      sharedConfig.host,
    ).map((r) => ({
      ...r,
      id: getIdFromCreateACLRequest(r),
    }));
    const newRules: ACLWithId[] = convertRulesToCreateACLRequests(rules, sharedConfig.principal, sharedConfig.host).map(
      (r) => ({
        ...r,
        id: getIdFromCreateACLRequest(r),
      }),
    );

    const { toCreate, toDelete } = calculateACLDifference(currentRules, newRules);

    const createResults = toCreate.map((r) => createACLMutation(r));
    const deleteResults = toDelete.map((r) =>
      deleteACLMutation(
        create(DeleteACLsRequestSchema, {
          filter: {
            principal: r.principal,
            resourceType: r.resourceType,
            resourceName: r.resourceName,
            host: r.host,
            operation: r.operation,
            permissionType: r.permissionType,
            resourcePatternType: r.resourcePatternType,
          },
        }),
      ),
    );

    const allResults = await Promise.allSettled([...createResults, ...deleteResults]);
    const errs = new Map<number, ConnectError>();
    const rejected = allResults.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    rejected.forEach((result) => {
      const r = result.reason as ConnectError;
      errs.set(r.code, r);
    });
    await invalid();
    return { errors: errs.values().toArray(), created: rejected.length < allResults.length };
  };

  return { applyUpdates };
};

export const useGetAclsByPrincipal = <T = AclDetail>(
  principal: string,
  transformFn?: (aclList: ListACLsResponse) => T,
) => {
  return useQuery(
    listACLs,
    {
      filter: {
        principal,
      },
    } as ListACLsRequest,
    {
      select: transformFn ?? (getAclFromAclListResponse as (aclList: ListACLsResponse) => T),
    },
  );
};

export const useCreateAcls = () => {
  const { mutateAsync: createACLMutation } = useMutation(createACL);
  const { invalid } = useInvalidateAclsList();

  const createAcls = async (acls: CreateACLRequest[]) => {
    const results = await Promise.allSettled(acls.map((r) => createACLMutation(r)));
    const errs = new Map<number, ConnectError>();
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    rejected.forEach((result) => {
      const r = result.reason as ConnectError;
      errs.set(r.code, r);
    });
    await invalid();
    return { errors: errs.values().toArray(), created: rejected.length < results.length };
  };
  return { createAcls };
};
