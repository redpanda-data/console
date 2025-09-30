/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: when parsing YAML, we have no way to predict the exact document we get */

import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { parse, stringify } from 'yaml';
import type { FormValues } from '../schemas';

/**
 * Keep YAML label in sync with Tool Name field
 */
export function useYamlLabelSync(form: UseFormReturn<FormValues>) {
  useEffect(() => {
    const subscription = form.watch((_, info) => {
      const name = info.name ?? '';
      if (!name.startsWith('tools')) return;

      // tools.{index}.field
      const match = name.match(/^tools\.(\d+)\.(name|config)$/);
      if (!match) return;
      const index = Number(match[1]);
      const field = match[2] as 'name' | 'config';

      const tool = form.getValues(`tools.${index}`);
      if (!tool) return;

      if (field === 'name') {
        // Update YAML label when the tool name changes
        try {
          const doc = parse(tool.config) ?? {};
          if ((doc as any).label !== tool.name) {
            (doc as any).label = tool.name ?? '';
            const updated = stringify(doc);
            if (updated !== tool.config) {
              form.setValue(`tools.${index}.config`, updated, { shouldValidate: false, shouldDirty: true });
            }
          }
        } catch {
          // ignore YAML parse errors here; validation will handle it
        }
      }

      if (field === 'config') {
        // Update tool name from YAML label if present
        try {
          const doc = parse(tool.config);
          const label = (doc as any)?.label;
          if (typeof label === 'string' && label.length > 0 && label !== tool.name) {
            form.setValue(`tools.${index}.name`, label, { shouldValidate: false, shouldDirty: true });
          }
        } catch {
          // ignore
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);
}
