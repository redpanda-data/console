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

import { compareStrings } from 'utils/string-utils';

export type SecretReference = {
  secretName: string;
  nestedKey?: string;
  fullReference: string;
  defaultValue?: string;
};

/**
 * Extract secret references from YAML content.
 * Matches patterns like:
 * - ${secrets.SECRET_NAME}
 * - ${secrets.SECRET_NAME.key}
 * - ${secrets.SECRET_NAME.nested.key}
 * - ${secrets.SECRET_NAME.nested.key:default-value}
 */
function parseSecretReference(fullReference: string, referencePath: string): SecretReference {
  const separator = referencePath.indexOf(':');
  const secretPath = separator >= 0 ? referencePath.slice(0, separator) : referencePath;
  const [secretName, ...nestedParts] = secretPath.split('.');
  return {
    secretName,
    nestedKey: nestedParts.join('.') || undefined,
    fullReference,
    defaultValue: separator >= 0 ? referencePath.slice(separator + 1) : undefined,
  };
}

export function extractSecretReferences(yamlContent: string): SecretReference[] {
  const references: SecretReference[] = [];
  const secretPattern = /\$\{secrets\.([^}]+)\}/g;
  const matches = yamlContent.matchAll(secretPattern);
  for (const match of matches) {
    const reference = parseSecretReference(match[0], match[1]);
    if (
      references.every(
        (existing) => existing.secretName !== reference.secretName || existing.nestedKey !== reference.nestedKey
      )
    ) {
      references.push(reference);
    }
  }
  return references;
}

/**
 * Get unique secret names from secret references
 */
export function getUniqueSecretNames(references: SecretReference[]): string[] {
  const uniqueNames = new Set<string>();
  for (const ref of references) {
    uniqueNames.add(ref.secretName);
  }
  return Array.from(uniqueNames).sort(compareStrings);
}
