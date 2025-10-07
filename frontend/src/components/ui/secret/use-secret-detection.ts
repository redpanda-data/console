/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { FormValues } from 'components/pages/mcp-servers/create/schemas';
import { useEffect, useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { extractSecretReferences, getUniqueSecretNames } from './secret-detection';

export function useSecretDetection(form: UseFormReturn<FormValues>, existingSecrets: string[]) {
  const [detectedSecrets, setDetectedSecrets] = useState<string[]>([]);

  // Detect secrets in YAML configurations
  useEffect(() => {
    const subscription = form.watch(() => {
      const tools = form.getValues('tools');
      const allSecretReferences: string[] = [];

      for (const tool of tools) {
        if (tool.config) {
          try {
            const secretRefs = extractSecretReferences(tool.config);
            const secretNames = getUniqueSecretNames(secretRefs);
            allSecretReferences.push(...secretNames);
          } catch {
            // Ignore YAML parsing errors
          }
        }
      }

      // Get unique secret names
      const uniqueSecrets = Array.from(new Set(allSecretReferences)).sort();
      setDetectedSecrets(uniqueSecrets);
    });

    return () => subscription.unsubscribe();
  }, [form]);

  // Check if any detected secrets are missing
  const hasSecretWarnings = useMemo(() => {
    if (detectedSecrets.length === 0) {
      return false;
    }
    return detectedSecrets.some((secretName) => !existingSecrets.includes(secretName));
  }, [detectedSecrets, existingSecrets]);

  return { detectedSecrets, hasSecretWarnings };
}
