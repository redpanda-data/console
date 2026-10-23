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
import { StopCircleIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge } from 'components/redpanda-ui/components/status-badge';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { PIPELINE_STATE_LABELS, PIPELINE_STATE_STATUS_VARIANT } from 'components/ui/pipeline/constants';
import { Play } from 'lucide-react';
import {
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { type Pipeline_State, Pipeline_State as PipelineState } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useState } from 'react';
import { useStartPipelineMutation, useStopPipelineMutation } from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { useRunHistoryStore } from 'state/rpcn-run-history-preview';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export function PipelineStateBadge({ state, tooltip }: { state?: Pipeline_State; tooltip?: string }) {
  // A state a newer server knows and this build does not falls through to the UNSPECIFIED copy.
  const known = state ?? PipelineState.UNSPECIFIED;
  const label = PIPELINE_STATE_LABELS[known] ?? PIPELINE_STATE_LABELS[PipelineState.UNSPECIFIED];
  const variant = PIPELINE_STATE_STATUS_VARIANT[known] ?? PIPELINE_STATE_STATUS_VARIANT[PipelineState.UNSPECIFIED];
  return (
    <StatusBadge role="status" size="sm" testId="pipeline-state-badge" title={tooltip} variant={variant}>
      {label}
    </StatusBadge>
  );
}

type RunAction = 'start' | 'stop' | 'cancel-start' | 'settling';

function runActionForState(state?: Pipeline_State): RunAction | null {
  switch (state) {
    case PipelineState.RUNNING:
      return 'stop';
    case PipelineState.STARTING:
      return 'cancel-start';
    case PipelineState.STOPPING:
      return 'settling';
    case PipelineState.STOPPED:
    case PipelineState.ERROR:
    case PipelineState.COMPLETED:
      return 'start';
    // Drafts start through `useStartDraft`.
    default:
      return null;
  }
}

const START_LABEL = 'Start pipeline';
// A scheduled pipeline's Start is one extra run; its schedule carries on.
const RUN_NOW_LABEL = 'Run now';
const RUN_NOW_HINT = 'Starts one run now. The schedule stays as it is.';

const STOP_COPY = {
  action: 'Stop pipeline',
  confirmTitle: 'Stop pipeline?',
  confirmBody: 'Stopping the pipeline halts all data processing until you start it again.',
  dismiss: 'Cancel',
} as const;

const CANCEL_START_COPY = {
  action: 'Cancel start',
  confirmTitle: 'Cancel pipeline start?',
  confirmBody: 'This stops the pipeline before it finishes starting and returns it to Stopped.',
  dismiss: 'Keep starting',
} as const;

export function PipelineRunButton({
  pipelineId,
  pipelineState,
  scheduled = false,
}: {
  pipelineId: string;
  pipelineState?: Pipeline_State;
  /** With a schedule, starting it is a single run. */
  scheduled?: boolean;
}) {
  const { mutate: startMutation, isPending: isStartPending } = useStartPipelineMutation();
  const { mutate: stopMutation, isPending: isStopPending } = useStopPipelineMutation();
  const startManualRun = useRunHistoryStore((s) => s.startManualRun);
  const requestStop = useRunHistoryStore((s) => s.requestStop);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);

  const action = runActionForState(pipelineState);
  const isCancellingStart = action === 'cancel-start';

  const handleStart = useCallback(() => {
    startMutation(create(StartPipelineRequestSchema, { request: { id: pipelineId } }), {
      onSuccess: () => {
        // A scheduled pipeline's runs are recorded; this one was started by hand.
        if (scheduled) {
          startManualRun(pipelineId);
        }
        toast.success(scheduled ? 'Run starting' : 'Pipeline starting');
      },
      onError: (err) =>
        toast.error(
          formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'start', entity: 'pipeline' })
        ),
    });
  }, [pipelineId, startMutation, scheduled, startManualRun]);

  const performStop = useCallback(() => {
    stopMutation(create(StopPipelineRequestSchema, { request: { id: pipelineId } }), {
      onSuccess: () => {
        requestStop(pipelineId);
        toast.success(isCancellingStart ? 'Canceling pipeline start' : 'Pipeline stopping');
        setIsStopConfirmOpen(false);
      },
      onError: (err) => {
        toast.error(formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'stop', entity: 'pipeline' }));
        setIsStopConfirmOpen(false);
      },
    });
  }, [pipelineId, stopMutation, isCancellingStart, requestStop]);

  if (action === null) {
    return null;
  }

  const startLabel = scheduled ? RUN_NOW_LABEL : START_LABEL;
  if (action === 'start') {
    const button = (
      <Button
        disabled={isStartPending}
        icon={isStartPending ? <Spinner /> : <Play />}
        onClick={handleStart}
        testId="pipeline-start"
      >
        {startLabel}
      </Button>
    );
    return scheduled ? (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>{button}</TooltipTrigger>
        <TooltipContent>{RUN_NOW_HINT}</TooltipContent>
      </Tooltip>
    ) : (
      button
    );
  }

  if (action === 'settling') {
    return (
      <Button disabled icon={<Play />} testId="pipeline-start" title="Wait for the pipeline to finish stopping.">
        {startLabel}
      </Button>
    );
  }

  const stopCopy = isCancellingStart ? CANCEL_START_COPY : STOP_COPY;
  return (
    <>
      <Button
        disabled={isStopPending}
        icon={isStopPending ? <Spinner /> : <StopCircleIcon />}
        onClick={() => setIsStopConfirmOpen(true)}
        testId="pipeline-stop"
        variant="destructive-outline"
      >
        {stopCopy.action}
      </Button>
      <Dialog onOpenChange={setIsStopConfirmOpen} open={isStopConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stopCopy.confirmTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>{stopCopy.confirmBody}</DialogBody>
          <DialogFooter>
            <Button onClick={() => setIsStopConfirmOpen(false)} variant="ghost">
              {stopCopy.dismiss}
            </Button>
            <Button
              disabled={isStopPending}
              icon={isStopPending ? <Spinner /> : <StopCircleIcon />}
              onClick={performStop}
              testId="confirm-stop-pipeline"
              variant="destructive"
            >
              {stopCopy.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
