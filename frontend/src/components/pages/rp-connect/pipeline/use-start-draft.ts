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
import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { useNavigate } from '@tanstack/react-router';
import { StartPipelineRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { useCallback } from 'react';
import { useStartPipelineMutation } from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { startBlockedMessage } from './draft-copy';
import { isInvalidConfigError } from './save-actions';
import { extractLintHintsFromError } from '../errors';

// A refused start's hints, for the editor it opens; taken once, after hydration.
const pendingStartLintHints = new Map<string, Record<string, LintHint>>();

export function takeStartLintHints(pipelineId: string): Record<string, LintHint> | null {
  const hints = pendingStartLintHints.get(pipelineId) ?? null;
  pendingStartLintHints.delete(pipelineId);
  return hints;
}

/** Starting a draft validates it; a lint refusal opens the editor, where the hints are actionable. */
export function useStartDraft() {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useStartPipelineMutation();

  const startDraft = useCallback(
    async (pipelineId: string): Promise<void> => {
      try {
        await mutateAsync(create(StartPipelineRequestSchema, { request: { id: pipelineId } }));
        toast.success('Pipeline starting');
      } catch (err) {
        const error = ConnectError.from(err);
        if (isInvalidConfigError(error)) {
          const hints = extractLintHintsFromError(error);
          pendingStartLintHints.set(pipelineId, hints);
          toast.error(startBlockedMessage(Object.keys(hints).length));
          navigate({ to: '/rp-connect/$pipelineId/edit', params: { pipelineId } });
          return;
        }
        toast.error(formatToastErrorMessageGRPC({ error, action: 'start', entity: 'pipeline' }));
      }
    },
    [mutateAsync, navigate]
  );

  return { startDraft, isStartingDraft: isPending };
}
