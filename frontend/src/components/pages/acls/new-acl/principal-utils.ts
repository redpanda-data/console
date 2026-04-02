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
