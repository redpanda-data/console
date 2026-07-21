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

/**
 * Parses a principal from a route parameter.
 * aclName may be a full principal like "Group:mygroup" or just a bare name (defaults to User).
 */
export function parsePrincipalFromParam(aclName: string): { principalType: string; principalName: string } {
  const colonIdx = aclName.indexOf(':');
  if (colonIdx >= 0) {
    return { principalType: aclName.slice(0, colonIdx), principalName: aclName.slice(colonIdx + 1) };
  }
  return { principalType: 'User', principalName: aclName };
}

// Principal type prefixes (matching PrincipalType from acl.model.tsx).
// Defined here to avoid importing acl.model.tsx which has heavy DOM dependencies.
const PRINCIPAL_TYPE_MAP: Record<string, 'User:' | 'RedpandaRole:' | 'Group:'> = {
  user: 'User:',
  redpandarole: 'RedpandaRole:',
  group: 'Group:',
};

/**
 * Resolves route search params into the sharedConfig and principalType
 * needed by the CreateACL component.
 */
export function resolveAclSearchParams(search: { principalType?: string; principalName?: string }): {
  sharedConfig?: { principal: string; host: string };
  principalType?: 'User:' | 'RedpandaRole:' | 'Group:';
} {
  const principalTypeParam = search.principalType?.toLowerCase();
  const principalName = search.principalName;
  const principalType = principalTypeParam ? PRINCIPAL_TYPE_MAP[principalTypeParam] : undefined;

  const sharedConfig =
    principalName && principalType ? { principal: `${principalType}${principalName}`, host: '*' } : undefined;

  return { sharedConfig, principalType };
}
