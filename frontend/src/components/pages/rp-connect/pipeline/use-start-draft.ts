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

/**
 * Starting a draft is its first deployment, so it is the moment its configuration is validated. That
 * makes it the one start that can fail for a reason the user has to go and *edit* — which an error
 * toast on a list row cannot help with.
 *
 * So a rejected start opens the editor, where the lint panel and the structure tree already mark every
 * problem, and the toast says how many there are. Any other failure (permissions, quota, transport) is
 * reported where the user is: it isn't about the config, so the editor has nothing to add.
 */
export function useStartDraft() {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useStartPipelineMutation();

  const startDraft = useCallback(
    async (pipelineId: string): Promise<boolean> => {
      try {
        await mutateAsync(create(StartPipelineRequestSchema, { request: { id: pipelineId } }));
        toast.success('Pipeline starting');
        return true;
      } catch (err) {
        const error = ConnectError.from(err);
        if (isInvalidConfigError(error)) {
          toast.error(startBlockedMessage(Object.keys(extractLintHintsFromError(error)).length));
          navigate({
            to: '/rp-connect/$pipelineId/edit',
            params: { pipelineId: encodeURIComponent(pipelineId) },
          });
          return false;
        }
        toast.error(formatToastErrorMessageGRPC({ error, action: 'start', entity: 'pipeline' }));
        return false;
      }
    },
    [mutateAsync, navigate]
  );

  return { startDraft, isStartingDraft: isPending };
}
