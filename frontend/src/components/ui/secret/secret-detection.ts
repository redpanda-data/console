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

export interface SecretReference {
  secretName: string;
  nestedKey?: string;
  fullReference: string;
}

/**
 * Extract secret references from YAML content.
 * Matches patterns like:
 * - ${secrets.SECRET_NAME}
 * - ${secrets.SECRET_NAME.key}
 * - ${secrets.SECRET_NAME.nested.key}
 */
export function extractSecretReferences(yamlContent: string): SecretReference[] {
  const secretReferences: SecretReference[] = [];

  // Regex to match ${secrets.SOMETHING} patterns
  const secretPattern = /\$\{secrets\.([^}]+)\}/g;
  let match: RegExpExecArray | null = secretPattern.exec(yamlContent);

  while (match !== null) {
    const fullReference = match[0];
    const secretPath = match[1];

    // Split by dot to get secret name and nested keys
    const pathParts = secretPath.split('.');
    const secretName = pathParts[0];
    const nestedKey = pathParts.slice(1).join('.');

    // Check if we already have this secret reference
    const existing = secretReferences.find((ref) => ref.secretName === secretName && ref.nestedKey === nestedKey);

    if (!existing) {
      secretReferences.push({
        secretName,
        nestedKey: nestedKey || undefined,
        fullReference,
      });
    }

    // Get the next match
    match = secretPattern.exec(yamlContent);
  }

  return secretReferences;
}

/**
 * Get unique secret names from secret references
 */
export function getUniqueSecretNames(references: SecretReference[]): string[] {
  const uniqueNames = new Set<string>();
  for (const ref of references) {
    uniqueNames.add(ref.secretName);
  }
  return Array.from(uniqueNames).sort();
}
