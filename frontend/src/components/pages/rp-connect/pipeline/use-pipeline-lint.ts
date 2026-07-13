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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { Code, ConnectError } from '@connectrpc/connect';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import { useMemo } from 'react';
import { useLintPipelineConfigQuery } from 'react-query/api/connect';

import { extractLintHintsFromError } from '../errors';
import { localYamlLintHints, mergeLintHints } from '../utils/pipeline-lint';

/**
 * Deduped hints for the Lint-issues panel: server lint RPC, client-side YAML syntax errors, and
 * save-error hints. Debounced so it doesn't re-lint on every keystroke.
 */
export function usePipelineLint(yamlContent: string, errorLintHints: Record<string, LintHint>, enabled: boolean) {
  const debouncedYamlContent = useDebouncedValue(yamlContent, 500);
  const {
    data: lintResponse,
    isPending: isLintPending,
    isError: isLintError,
    error: lintError,
  } = useLintPipelineConfigQuery(debouncedYamlContent, { enabled });

  // The server can't lint an unparseable doc, so without these it would read as "No issues found".
  const syntaxHints = useMemo(
    () => (enabled ? localYamlLintHints(debouncedYamlContent) : []),
    [enabled, debouncedYamlContent]
  );

  const lintHints = useMemo(() => {
    // Local syntax errors supersede: server lint returns nothing and save-error hints repeat the same problem
    // with worse positions.
    if (syntaxHints.length > 0) {
      return mergeLintHints({}, [], syntaxHints);
    }
    // Surface lint RPC rejections (invalid_argument) as hints; ignore transient infra failures,
    // which would falsely flag valid YAML.
    const rejection =
      isLintError && lintError instanceof ConnectError && lintError.code === Code.InvalidArgument
        ? Object.values(extractLintHintsFromError(lintError))
        : [];
    // Dedupe: after a failed save the same problem arrives from the error details and the re-lint.
    return mergeLintHints(errorLintHints, lintResponse?.lintHints ?? [], rejection);
  }, [syntaxHints, isLintError, lintError, errorLintHints, lintResponse]);

  return { lintHints, isLintPending };
}
