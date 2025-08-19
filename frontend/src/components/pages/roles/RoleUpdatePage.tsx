/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@redpanda-data/ui';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  convertRulesToCreateACLRequests,
  getAclFromAclListResponse,
  getIdFromCreateACLRequest,
  getOperationsForResourceType,
  ModeAllowAll,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  PrincipalTypeRedpandaRole,
  type Rule,
  type SharedConfig,
} from '@/components/pages/acls/new-acl/ACL.model';
import CreateACL from '@/components/pages/acls/new-acl/CreateACL';
import {
  ACLService,
  type CreateACLRequest,
  type DeleteACLsRequest,
  type ListACLsRequest,
} from '@/protogen/redpanda/api/dataplane/v1/acl_pb';
import { createACL, deleteACLs, listACLs } from '@/protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { uiState } from '../../../state/uiState';
import PageContent from '../../misc/PageContent';

interface ACLWithId extends CreateACLRequest {
  id: string;
}

interface ACLDifference {
  toCreate: ACLWithId[];
  toDelete: ACLWithId[];
}

/**
 * Compares current ACL rules with new rules to determine which need to be created and deleted
 * @param currentRules - The existing ACL rules
 * @param newRules - The desired ACL rules
 * @returns Object containing arrays of rules to create and delete
 */
function calculateACLDifference(currentRules: ACLWithId[], newRules: ACLWithId[]): ACLDifference {
  const currentIds = new Set(currentRules.map((r) => r.id));
  const newIds = new Set(newRules.map((r) => r.id));

  // Rules to create: in newRules but not in currentRules
  const toCreate = newRules.filter((rule) => !currentIds.has(rule.id));

  // Rules to delete: in currentRules but not in newRules
  const toDelete = currentRules.filter((rule) => !newIds.has(rule.id));

  return {
    toCreate,
    toDelete,
  };
}

const RoleUpdatePage = () => {
  const toast = useToast();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { roleName = '' } = useParams<{ roleName: string }>();

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'Roles', linkTo: '/security/roles' },
      { title: roleName, linkTo: `/security/roles/${roleName}/details` },
      { title: '', linkTo: `/security/roles/${roleName}/update`, heading: '' },
    ];
  }, [roleName]);

  // Fetch existing ACL data for the role
  const { data, isLoading } = useQuery(
    listACLs,
    {
      filter: {
        principal: `RedpandaRole:${roleName}`,
      },
    } as ListACLsRequest,
    {
      enabled: !!roleName,
      select: getAclFromAclListResponse,
    },
  );

  const { mutateAsync: createACLMutation } = useMutation(createACL);
  const { mutateAsync: deleteACLMutation } = useMutation(deleteACLs);

  const updateRoleAclMutation =
    (actualRules: Rule[], sharedConfig: SharedConfig) => async (_: string, _2: string, rules: Rule[]) => {
      const currentRules: ACLWithId[] = convertRulesToCreateACLRequests(
        actualRules,
        sharedConfig.principal,
        sharedConfig.host,
      ).map((r) => ({
        ...r,
        id: getIdFromCreateACLRequest(r),
      }));
      const newRules: ACLWithId[] = convertRulesToCreateACLRequests(
        rules,
        sharedConfig.principal,
        sharedConfig.host,
      ).map((r) => ({
        ...r,
        id: getIdFromCreateACLRequest(r),
      }));

      const { toCreate, toDelete } = calculateACLDifference(currentRules, newRules);

      console.log('Rules to create:', toCreate);
      console.log('Rules to delete:', toDelete);

      const createResults = toCreate.map((r) => createACLMutation(r));
      const deleteResults = toDelete.map((r) => {
        const d: DeleteACLsRequest = {
          filter: {
            principal: r.principal,
            resourceType: r.resourceType,
            resourceName: r.resourceName,
            host: r.host,
            operation: r.operation,
            permissionType: r.permissionType,
            resourcePatternType: r.resourcePatternType,
            $typeName: 'redpanda.api.dataplane.v1.DeleteACLsRequest.Filter',
          },
          $typeName: 'redpanda.api.dataplane.v1.DeleteACLsRequest',
        };
        return deleteACLMutation(d);
      });

      await Promise.all([...createResults, ...deleteResults]);

      // TODO: handle partial failures
      toast({
        status: 'success',
        description: 'Role ACLs updated successfully',
      });

      // Invalidate the listACLs query cache to force fresh data on next request
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ACLService,
          cardinality: 'finite',
        }),
      });

      nav(`/security/roles/${roleName}/details`);
    };

  if (isLoading || !data) {
    return (
      <PageContent>
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading role configuration...</div>
        </div>
      </PageContent>
    );
  }

  // Ensure all operations are present for each rule
  const rulesWithAllOperations = data.rules.map((rule) => {
    const allOperations = getOperationsForResourceType(rule.resourceType);
    let mergedOperations = { ...allOperations };

    // If mode is AllowAll or DenyAll, set all operations accordingly
    if (rule.mode === ModeAllowAll) {
      mergedOperations = Object.fromEntries(Object.keys(allOperations).map((op) => [op, OperationTypeAllow]));
    } else if (rule.mode === ModeDenyAll) {
      mergedOperations = Object.fromEntries(Object.keys(allOperations).map((op) => [op, OperationTypeDeny]));
    } else {
      // For custom mode, override with the actual values from the fetched rule
      Object.entries(rule.operations).forEach(([op, value]) => {
        if (op in mergedOperations) {
          mergedOperations[op] = value;
        }
      });
    }

    return {
      ...rule,
      operations: mergedOperations,
    };
  });

  return (
    <PageContent>
      <CreateACL
        onSubmit={updateRoleAclMutation(data.rules, data.sharedConfig)}
        onCancel={() => nav(`/security/roles/${roleName}/details`)}
        rules={rulesWithAllOperations}
        sharedConfig={data.sharedConfig}
        edit={true}
        principalType={PrincipalTypeRedpandaRole}
      />
    </PageContent>
  );
};

export default RoleUpdatePage;
