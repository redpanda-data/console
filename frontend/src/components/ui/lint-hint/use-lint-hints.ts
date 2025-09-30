/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { FormValues } from 'components/pages/remote-mcp/create/schemas';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import { useEffect, useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

export function useLintHints(form: UseFormReturn<FormValues>) {
  const [lintHints, setLintHints] = useState<Record<number, Record<string, LintHint>>>({});

  // Clear lint hints when tool config changes
  useEffect(() => {
    const subscription = form.watch((_, info) => {
      const name = info.name ?? '';
      if (name.startsWith('tools') && name.endsWith('config')) {
        const match = name.match(/^tools\.(\d+)\.config$/);
        if (match) {
          const index = Number(match[1]);
          setLintHints((prev) => ({
            ...prev,
            [index]: {},
          }));
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Check if there are any linting issues
  const hasLintingIssues = useMemo(() => {
    return Object.values(lintHints).some((toolLints) => Object.keys(toolLints).length > 0);
  }, [lintHints]);

  return { lintHints, setLintHints, hasLintingIssues };
}
