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
import { ElementTooltip } from 'components/misc/element-tooltip';
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

type StopCopy = typeof STOP_COPY | typeof CANCEL_START_COPY;

// Both mutations live here, above the action switch, so a state change mid-request keeps their callbacks.
function usePipelineRunActions(
  pipelineId: string,
  isCancellingStart: boolean,
  { scheduled, recordsRuns }: { scheduled: boolean; recordsRuns: boolean }
) {
  const { mutate: startMutation, isPending: isStartPending } = useStartPipelineMutation();
  const { mutate: stopMutation, isPending: isStopPending } = useStopPipelineMutation();
  const startManualRun = useRunHistoryStore((s) => s.startManualRun);
  const requestStop = useRunHistoryStore((s) => s.requestStop);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);

  const handleStart = useCallback(() => {
    // A run starts when it's asked for, so the page's data from before then can't end it.
    const startedAt = Date.now();
    startMutation(create(StartPipelineRequestSchema, { request: { id: pipelineId } }), {
      onSuccess: () => {
        if (recordsRuns) {
          startManualRun(pipelineId, { now: startedAt });
        }
        toast.success(scheduled ? 'Run starting' : 'Pipeline starting');
      },
      onError: (err) =>
        toast.error(
          formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'start', entity: 'pipeline' })
        ),
    });
  }, [pipelineId, startMutation, scheduled, recordsRuns, startManualRun]);

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

  return { handleStart, isStartPending, performStop, isStopPending, isStopConfirmOpen, setIsStopConfirmOpen };
}

function PipelineStopControl({
  copy,
  isPending,
  isConfirmOpen,
  onConfirmOpenChange,
  onConfirm,
}: {
  copy: StopCopy;
  isPending: boolean;
  isConfirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <Button
        disabled={isPending}
        icon={isPending ? <Spinner /> : <StopCircleIcon />}
        onClick={() => onConfirmOpenChange(true)}
        testId="pipeline-stop"
        variant="destructive-outline"
      >
        {copy.action}
      </Button>
      <Dialog onOpenChange={onConfirmOpenChange} open={isConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.confirmTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>{copy.confirmBody}</DialogBody>
          <DialogFooter>
            <Button onClick={() => onConfirmOpenChange(false)} variant="ghost">
              {copy.dismiss}
            </Button>
            <Button
              disabled={isPending}
              icon={isPending ? <Spinner /> : <StopCircleIcon />}
              onClick={onConfirm}
              testId="confirm-stop-pipeline"
              variant="destructive"
            >
              {copy.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Start, or Run now with a schedule; while the pipeline settles, disabled with the reason.
function PipelineStartControl({
  scheduled,
  settling,
  isPending,
  onStart,
}: {
  scheduled: boolean;
  settling: boolean;
  isPending: boolean;
  onStart: () => void;
}) {
  const label = scheduled ? RUN_NOW_LABEL : START_LABEL;
  if (settling) {
    return (
      // A disabled button takes no pointer events, so the reason hangs on a wrapper.
      <ElementTooltip content="Wait for the pipeline to finish stopping.">
        <span className="inline-flex cursor-not-allowed">
          <Button disabled icon={<Play />} testId="pipeline-start">
            {label}
          </Button>
        </span>
      </ElementTooltip>
    );
  }
  const button = (
    <Button disabled={isPending} icon={isPending ? <Spinner /> : <Play />} onClick={onStart} testId="pipeline-start">
      {label}
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

export function PipelineRunButton({
  pipelineId,
  pipelineState,
  scheduled = false,
  recordsRuns = scheduled,
}: {
  pipelineId: string;
  pipelineState?: Pipeline_State;
  /** With a schedule, starting it is a single run. */
  scheduled?: boolean;
  /** Starting it records a run: it stops on its own. */
  recordsRuns?: boolean;
}) {
  const action = runActionForState(pipelineState);
  const isCancellingStart = action === 'cancel-start';
  const run = usePipelineRunActions(pipelineId, isCancellingStart, { scheduled, recordsRuns });

  if (action === null) {
    return null;
  }

  if (action === 'start' || action === 'settling') {
    return (
      <PipelineStartControl
        isPending={run.isStartPending}
        onStart={run.handleStart}
        scheduled={scheduled}
        settling={action === 'settling'}
      />
    );
  }

  return (
    <PipelineStopControl
      copy={isCancellingStart ? CANCEL_START_COPY : STOP_COPY}
      isConfirmOpen={run.isStopConfirmOpen}
      isPending={run.isStopPending}
      onConfirm={run.performStop}
      onConfirmOpenChange={run.setIsStopConfirmOpen}
    />
  );
}
