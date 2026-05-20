import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import type { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, type UseMutationOptions, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  ACLService,
  type CreateACLRequest,
  DeleteACLsRequestSchema,
  type DeleteACLsResponseSchema,
  type ListACLsRequest,
  ListACLsRequestSchema,
  type ListACLsResponse,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { createACL, deleteACLs, listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import {
  type AclDetail,
  calculateACLDifference,
  convertRulesToCreateACLRequests,
  getAclFromAclListResponse,
  getIdFromCreateACLRequest,
  type Rule,
  type SharedConfig,
} from '../../components/pages/security/shared/acl-model';

export const useListACLsQuery = (
  input?: MessageInit<ListACLsRequest>,
  options?: QueryOptions<GenMessage<ListACLsRequest>, ListACLsResponse>
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

export const useCreateACLMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createACL, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ACLService.method.listACLs,
          cardinality: 'finite',
        }),
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'acl',
      }),
  });
};

// New ACL implementation

// Used by ACLs tab and Permissions List tab in the security section.
type SimpleAcl = {
  host: string;
  principal: string;
  principalType: string;
  principalName: string;
  hasAcl: boolean;
};
// Used by ACLs tab and Permissions List tab in the security section.
export const useListACLAsPrincipalGroups = () =>
  useQuery(listACLs, {} as ListACLsRequest, {
    select: (response) => {
      const groupsAcl = response.resources.reduce((acc, r) => {
        for (const a of r.acls) {
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
        }
        return acc;
      }, new Map<string, SimpleAcl>());
      return groupsAcl.values().toArray();
    },
  });

// New ACL implementation

interface ACLWithId extends CreateACLRequest {
  id: string;
}

const useInvalidateAclsList = () => {
  const queryClient = useQueryClient();

  const invalid = async () => {
    await queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: ACLService.method.listACLs,
        cardinality: 'finite',
      }),
    });
  };

  return {
    invalid,
  };
};

export const useDeleteAclMutation = (
  transportOptions?: UseMutationOptions<typeof DeleteACLsRequestSchema, typeof DeleteACLsResponseSchema>
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
      sharedConfig.host
    ).map((r) => ({
      ...r,
      id: getIdFromCreateACLRequest(r),
    }));
    const newRules: ACLWithId[] = convertRulesToCreateACLRequests(rules, sharedConfig.principal, sharedConfig.host).map(
      (r) => ({
        ...r,
        id: getIdFromCreateACLRequest(r),
      })
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
        })
      )
    );

    const allResults = await Promise.allSettled([...createResults, ...deleteResults]);
    const errs = new Map<number, ConnectError>();
    const rejected = allResults.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    for (const result of rejected) {
      const r = result.reason as ConnectError;
      errs.set(r.code, r);
    }
    await invalid();
    return { errors: errs.values().toArray(), created: rejected.length < allResults.length };
  };

  return { applyUpdates };
};

export const useGetAclsByPrincipal = <T = AclDetail[]>(
  principal: string,
  host?: string,
  transformFn?: (aclList: ListACLsResponse) => T,
  options?: QueryOptions<GenMessage<ListACLsResponse>, T>
) =>
  useQuery(
    listACLs,
    {
      filter: {
        principal,
        host,
      },
    },
    {
      select: transformFn ?? (getAclFromAclListResponse as (aclList: ListACLsResponse) => T),
      ...options,
    }
  );

export const useCreateAcls = () => {
  const { mutateAsync: createACLMutation } = useMutation(createACL);
  const { invalid } = useInvalidateAclsList();

  const createAcls = async (acls: CreateACLRequest[]) => {
    const results = await Promise.allSettled(acls.map((r) => createACLMutation(r)));
    const errs = new Map<number, ConnectError>();
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    for (const result of rejected) {
      const r = result.reason as ConnectError;
      errs.set(r.code, r);
    }
    await invalid();
    return { errors: errs.values().toArray(), created: rejected.length < results.length };
  };
  return { createAcls };
};
