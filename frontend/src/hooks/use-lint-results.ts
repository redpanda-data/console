/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import { useEffect, useMemo, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * Hook to manage lint results for form fields
 *
 * Automatically clears lint results when a tool's config field changes.
 * Works with any form that has fields matching the pattern: `tools.{index}.config`
 *
 * @param form - React Hook Form instance
 * @returns Object containing lintResults, setLintResults, and hasLintingIssues
 *
 * @example
 * ```tsx
 * const { lintResults, setLintResults, hasLintingIssues } = useLintResults(form);
 *
 * // Update lint results after linting
 * setLintResults((prev) => ({
 *   ...prev,
 *   [toolIndex]: response.lintHints || {},
 * }));
 * ```
 */
export function useLintResults<TFieldValues extends FieldValues = FieldValues>(form: UseFormReturn<TFieldValues>) {
  const [lintResults, setLintResults] = useState<Record<number, Record<string, LintHint>>>({});

  // Clear lint results when tool config changes
  useEffect(() => {
    const subscription = form.watch((_, info) => {
      const name = info.name ?? '';
      if (name.startsWith('tools') && name.endsWith('config')) {
        const match = name.match(/^tools\.(\d+)\.config$/);
        if (match) {
          const index = Number(match[1]);
          setLintResults((prev) => ({
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
    return Object.values(lintResults).some((toolLints) => Object.keys(toolLints).length > 0);
  }, [lintResults]);

  return { lintResults, setLintResults, hasLintingIssues };
}
