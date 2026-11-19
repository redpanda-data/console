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
import { localStopConditionLintHints, localYamlLintHints, mergeLintHints } from '../utils/pipeline-lint';

/**
 * Deduped hints for the Lint-issues panel: server lint RPC, client-side YAML syntax errors, and
 * save-error hints. Debounced so it doesn't re-lint on every keystroke.
 */
export function usePipelineLint(yamlContent: string, errorLintHints: Record<string, LintHint>, enabled: boolean) {
  const debouncedYamlContent = useDebouncedValue(yamlContent, 500);
  // A blank config has nothing to lint — the server would only reject it with
  // "config_yaml: value is required", which is noise before the user has typed anything.
  const lintEnabled = enabled && debouncedYamlContent.trim() !== '';
  const {
    data: lintResponse,
    isPending: isLintPending,
    isError: isLintError,
    error: lintError,
  } = useLintPipelineConfigQuery(debouncedYamlContent, { enabled: lintEnabled });

  const syntaxHints = useMemo(
    () => (enabled ? localYamlLintHints(debouncedYamlContent) : []),
    [enabled, debouncedYamlContent]
  );

  const stopHints = useMemo(
    () => (enabled ? localStopConditionLintHints(debouncedYamlContent) : []),
    [enabled, debouncedYamlContent]
  );

  const lintHints = useMemo(() => {
    if (syntaxHints.length > 0) {
      return mergeLintHints({}, [], syntaxHints);
    }
    const rejection =
      isLintError && lintError instanceof ConnectError && lintError.code === Code.InvalidArgument
        ? Object.values(extractLintHintsFromError(lintError))
        : [];
    return mergeLintHints(errorLintHints, lintResponse?.lintHints ?? [], [...rejection, ...stopHints]);
  }, [syntaxHints, isLintError, lintError, errorLintHints, lintResponse, stopHints]);

  // A disabled query reports isPending forever; only surface pending when a lint can actually run.
  return { lintHints, isLintPending: lintEnabled && isLintPending };
}
