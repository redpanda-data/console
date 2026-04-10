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

import { useListACLAsPrincipalGroups } from '../../../../react-query/api/acl';
import { useGetRedpandaInfoQuery } from '../../../../react-query/api/cluster-status';
import { useListUsersQuery } from '../../../../react-query/api/user';
import { rolesApi } from '../../../../state/backend-api';

export type PrincipalEntry = { name: string; principalType: 'User' | 'Group'; isScramUser: boolean };

/**
 * Pure transformation: merges SCRAM users, ACL principals, and role members
 * into a single deduplicated principal list.
 *
 * Exported separately for testability without hooks.
 */
export function mergePrincipals(
  scramUsers: { name: string }[],
  aclPrincipalGroups: { principalType: string; principalName: string }[],
  roleMembersMap: Map<string, { name: string }[]>
): PrincipalEntry[] {
  const scramUserNames = new Set(scramUsers.map((u) => u.name));

  const principals: PrincipalEntry[] = scramUsers.map((u) => ({
    name: u.name,
    principalType: 'User' as const,
    isScramUser: true,
  }));

  // Add principals referenced by ACLs that are not already listed as SCRAM users
  for (const g of aclPrincipalGroups) {
    if (
      (g.principalType === 'User' || g.principalType === 'Group') &&
      !g.principalName.includes('*') &&
      !principals.some((u) => u.name === g.principalName && u.principalType === g.principalType)
    ) {
      principals.push({
        name: g.principalName,
        principalType: g.principalType as 'User' | 'Group',
        isScramUser: scramUserNames.has(g.principalName),
      });
    }
  }

  // Add principals from role memberships
  for (const [_, roleMembers] of roleMembersMap) {
    for (const roleMember of roleMembers) {
      if (!principals.some((u) => u.name === roleMember.name)) {
        principals.push({
          name: roleMember.name,
          principalType: 'User',
          isScramUser: scramUserNames.has(roleMember.name),
        });
      }
    }
  }

  return principals;
}

/**
 * Hook that fetches and merges all principal sources into a single list.
 * Combines SCRAM users, ACL principals, and role members.
 */
export function usePrincipalList() {
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const isAdminApiConfigured = isRedpandaInfoSuccess && Boolean(redpandaInfo);

  const {
    data: usersData,
    isError: isUsersError,
    error: usersError,
  } = useListUsersQuery(undefined, {
    enabled: isAdminApiConfigured,
  });

  const { data: principalGroupsData, isError: isAclsError, error: aclsError } = useListACLAsPrincipalGroups();

  const principals = mergePrincipals(
    usersData?.users ?? [],
    principalGroupsData ?? [],
    rolesApi.roleMembers ?? new Map()
  );

  return {
    principals,
    isAdminApiConfigured,
    isUsersError,
    usersError,
    isAclsError,
    aclsError,
  };
}
