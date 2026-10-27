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
import { useStore } from 'zustand';

import { type PrincipalEntry, usePrincipalList } from './use-principal-list';
import {
  ACL_PermissionType,
  ACL_ResourceType,
  type ListACLsResponse,
  type ListACLsResponse_Policy,
  type ListACLsResponse_Resource,
} from '../../../../protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from '../../../../protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { getACLOperation } from '../../../../react-query/api/acl';
import { type RolePrincipal, useRolesStore } from '../../../../state/backend-api';

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

const ROLE_PRINCIPAL_PREFIX = 'RedpandaRole:';

type RoleMembers = Map<string, RolePrincipal[]>;

const toFlatAclEntry = (resource: ListACLsResponse_Resource, acl: ListACLsResponse_Policy): FlatAclEntry => ({
  resourceType: RESOURCE_TYPE_LABELS[resource.resourceType] ?? String(resource.resourceType),
  resourceName: resource.resourceName || '*',
  operation: getACLOperation(acl.operation),
  permissionType: acl.permissionType === ACL_PermissionType.DENY ? 'Deny' : 'Allow',
  host: acl.host || '*',
});

/** Every ACL of the response, flattened and keyed by principal (such as `User:alice`). */
const groupAclsByPrincipal = (response: ListACLsResponse) => {
  const aclsByPrincipal = new Map<string, FlatAclEntry[]>();
  for (const resource of response.resources) {
    for (const acl of resource.acls) {
      const entries = aclsByPrincipal.get(acl.principal) ?? [];
      entries.push(toFlatAclEntry(resource, acl));
      aclsByPrincipal.set(acl.principal, entries);
    }
  }
  return aclsByPrincipal;
};

/** The ACLs granted to roles, keyed by role name. */
const getRoleAcls = (aclsByPrincipal: Map<string, FlatAclEntry[]>) =>
  new Map(
    [...aclsByPrincipal]
      .filter(([principal]) => principal.startsWith(ROLE_PRINCIPAL_PREFIX))
      .map(([principal, acls]) => [principal.slice(ROLE_PRINCIPAL_PREFIX.length), acls])
  );

/** The ACLs a principal inherits, one group per role it belongs to that grants any. */
const getRoleAclGroups = (
  roleMembers: RoleMembers,
  roleAcls: Map<string, FlatAclEntry[]>,
  principal: RolePrincipal
): RoleAclGroup[] =>
  [...roleMembers]
    .filter(([, members]) =>
      members.some((m: RolePrincipal) => m.name === principal.name && m.principalType === principal.principalType)
    )
    .map(([roleName]) => ({ roleName, acls: roleAcls.get(roleName) ?? [] }))
    .filter((g) => g.acls.length > 0);

const toPrincipalPermissionGroup = (
  p: PrincipalEntry,
  aclsByPrincipal: Map<string, FlatAclEntry[]>,
  roleAclGroups: RoleAclGroup[]
): PrincipalPermissionGroup => {
  const principalKey = `${p.principalType}:${p.name}`;
  const directAcls = aclsByPrincipal.get(principalKey) ?? [];
  const allAcls = [...directAcls, ...roleAclGroups.flatMap((g) => g.acls)];

  return {
    principal: principalKey,
    principalType: p.principalType,
    principalName: p.name,
    isScramUser: p.isScramUser,
    directAcls,
    roleAclGroups,
    directAclCount: directAcls.length,
    inheritedAclCount: allAcls.length - directAcls.length,
    denyCount: allAcls.filter((e) => e.permissionType === 'Deny').length,
  };
};

export function useUserPermissions(userName: string) {
  const { data: allAclsData, isLoading } = useQuery(listACLs, {});
  const roleMembers = useStore(useRolesStore, (s) => s.roleMembers);

  const permissions = useMemo(() => {
    if (!allAclsData) {
      return { directAcls: [] as FlatAclEntry[], roleAclGroups: [] as RoleAclGroup[] };
    }
    const aclsByPrincipal = groupAclsByPrincipal(allAclsData);
    return {
      directAcls: aclsByPrincipal.get(`User:${userName}`) ?? [],
      roleAclGroups: getRoleAclGroups(roleMembers, getRoleAcls(aclsByPrincipal), {
        name: userName,
        principalType: 'User',
      }),
    };
  }, [allAclsData, roleMembers, userName]);

  return { ...permissions, isLoading };
}

export function usePrincipalPermissions() {
  const {
    data: allAclsData,
    isLoading: isAclsLoading,
    isError: isAclsError,
    error: aclsError,
  } = useQuery(listACLs, {});

  const { principals, isUsersError, usersError } = usePrincipalList();
  const roleMembers = useStore(useRolesStore, (s) => s.roleMembers);

  const principalGroups = useMemo<PrincipalPermissionGroup[]>(() => {
    if (!allAclsData) {
      return [];
    }
    const aclsByPrincipal = groupAclsByPrincipal(allAclsData);
    const roleAcls = getRoleAcls(aclsByPrincipal);
    return principals
      .filter((p) => p.principalType === 'User' || p.principalType === 'Group')
      .map((p) => toPrincipalPermissionGroup(p, aclsByPrincipal, getRoleAclGroups(roleMembers, roleAcls, p)));
  }, [allAclsData, principals, roleMembers]);

  return {
    principalGroups,
    isAclsLoading,
    isAclsError,
    aclsError,
    isUsersError,
    usersError,
  };
}
