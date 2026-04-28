/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useQuery } from '@connectrpc/connect-query';
import { useMemo } from 'react';

import { usePrincipalList } from './use-principal-list';
import {
  ACL_PermissionType,
  ACL_ResourceType,
  type ListACLsRequest,
} from '../../../../protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from '../../../../protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { getACLOperation } from '../../../../react-query/api/acl';
import { rolesApi } from '../../../../state/backend-api';

export type FlatAclEntry = {
  resourceType: string;
  resourceName: string;
  operation: string;
  permissionType: 'Allow' | 'Deny';
  host: string;
};

export type RoleAclGroup = {
  roleName: string;
  acls: FlatAclEntry[];
};

export type PrincipalPermissionGroup = {
  principal: string;
  principalType: 'User' | 'Group';
  principalName: string;
  isScramUser: boolean;
  directAcls: FlatAclEntry[];
  roleAclGroups: RoleAclGroup[];
  directAclCount: number;
  inheritedAclCount: number;
  denyCount: number;
};

const RESOURCE_TYPE_LABELS: Partial<Record<ACL_ResourceType, string>> = {
  [ACL_ResourceType.TOPIC]: 'Topic',
  [ACL_ResourceType.GROUP]: 'Consumer Group',
  [ACL_ResourceType.CLUSTER]: 'Cluster',
  [ACL_ResourceType.TRANSACTIONAL_ID]: 'Transactional ID',
  [ACL_ResourceType.SUBJECT]: 'Subject',
  [ACL_ResourceType.REGISTRY]: 'Schema Registry',
};

export function usePrincipalPermissions() {
  const {
    data: allAclsData,
    isLoading: isAclsLoading,
    isError: isAclsError,
    error: aclsError,
  } = useQuery(listACLs, {} as ListACLsRequest);

  const { principals, isUsersError, usersError } = usePrincipalList();

  const principalGroups = useMemo<PrincipalPermissionGroup[]>(() => {
    if (!allAclsData) return [];

    // Build flat ACL list per principal
    const aclsByPrincipal = new Map<string, FlatAclEntry[]>();
    for (const resource of allAclsData.resources) {
      for (const acl of resource.acls) {
        const key = acl.principal;
        if (!aclsByPrincipal.has(key)) {
          aclsByPrincipal.set(key, []);
        }
        aclsByPrincipal.get(key)!.push({
          resourceType: RESOURCE_TYPE_LABELS[resource.resourceType] ?? String(resource.resourceType),
          resourceName: resource.resourceName || '*',
          operation: getACLOperation(acl.operation),
          permissionType: acl.permissionType === ACL_PermissionType.DENY ? 'Deny' : 'Allow',
          host: acl.host || '*',
        });
      }
    }

    // Extract role ACLs: principal = "RedpandaRole:roleName"
    const roleAcls = new Map<string, FlatAclEntry[]>();
    for (const [principal, acls] of aclsByPrincipal) {
      if (principal.startsWith('RedpandaRole:')) {
        roleAcls.set(principal.slice('RedpandaRole:'.length), acls);
      }
    }

    return principals
      .filter((p) => p.principalType === 'User' || p.principalType === 'Group')
      .map((p) => {
        const principalKey = `${p.principalType}:${p.name}`;
        const directAcls = aclsByPrincipal.get(principalKey) ?? [];

        const belongsToRoles: string[] = [];
        for (const [roleName, members] of rolesApi.roleMembers) {
          if (members.some((m) => m.name === p.name && m.principalType === p.principalType)) {
            belongsToRoles.push(roleName);
          }
        }

        const roleAclGroups: RoleAclGroup[] = belongsToRoles
          .map((roleName) => ({ roleName, acls: roleAcls.get(roleName) ?? [] }))
          .filter((g) => g.acls.length > 0);

        const inheritedAclCount = roleAclGroups.reduce((sum, g) => sum + g.acls.length, 0);
        const denyCount = [...directAcls, ...roleAclGroups.flatMap((g) => g.acls)].filter(
          (e) => e.permissionType === 'Deny'
        ).length;

        return {
          principal: principalKey,
          principalType: p.principalType,
          principalName: p.name,
          isScramUser: p.isScramUser,
          directAcls,
          roleAclGroups,
          directAclCount: directAcls.length,
          inheritedAclCount,
          denyCount,
        };
      });
  }, [allAclsData, principals]);

  return {
    principalGroups,
    isAclsLoading,
    isAclsError,
    aclsError,
    isUsersError,
    usersError,
  };
}
