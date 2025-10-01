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

import { useMemo } from 'react';
import { extractSecretReferences, getUniqueSecretNames } from 'utils/secret-detection';

/**
 * Hook to detect secret references in YAML content
 * @param yamlContent - YAML content to scan for secret references
 * @param existingSecrets - List of secrets that already exist
 * @returns Object containing detected secrets and whether there are missing secrets
 */
export function useSecretDetection(yamlContent: string, existingSecrets: string[]) {
  // Extract and deduplicate secret names from YAML content
  const detectedSecrets = useMemo(() => {
    try {
      const secretRefs = extractSecretReferences(yamlContent);
      return getUniqueSecretNames(secretRefs);
    } catch {
      // Ignore parsing errors and return empty array
      return [];
    }
  }, [yamlContent]);

  // Check if any detected secrets are missing
  const hasSecretWarnings = useMemo(() => {
    if (detectedSecrets.length === 0) return false;
    return detectedSecrets.some((secretName) => !existingSecrets.includes(secretName));
  }, [detectedSecrets, existingSecrets]);

  return { detectedSecrets, hasSecretWarnings };
}
