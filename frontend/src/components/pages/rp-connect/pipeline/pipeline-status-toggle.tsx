/**
 * Copyright 2025 Redpanda Data, Inc.
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
import { cva } from 'class-variance-authority';
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
import { Switch } from 'components/redpanda-ui/components/switch';
import { cn } from 'components/redpanda-ui/lib/utils';
import { PIPELINE_STATE_LABELS } from 'components/ui/pipeline/constants';
import {
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { type Pipeline_State, Pipeline_State as PipelineState } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useState } from 'react';
import { useStartPipelineMutation, useStopPipelineMutation } from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

type Tone = 'success' | 'error' | 'muted';

// Pill chrome per state: running is a filled green pill, error is red text,
// everything else (stopped/completed/transitioning) reads as plain muted text.
const statusPill = cva(
  'inline-flex h-9 items-center gap-2 rounded-full border px-3 font-medium text-sm transition-colors',
  {
    variants: {
      tone: {
        success: 'border-outline-success bg-background-success-subtle text-success',
        error: 'border-transparent text-destructive',
        muted: 'border-transparent text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'muted' },
  }
);

function getTone(state?: Pipeline_State): Tone {
  if (state === PipelineState.RUNNING || state === PipelineState.STARTING) {
    return 'success';
  }
  if (state === PipelineState.ERROR) {
    return 'error';
  }
  return 'muted';
}

// Combined status + run control: a switch whose on/off mirrors the pipeline's
// running state, paired with the state label. Turning it on starts the
// pipeline; turning it off opens a stop confirmation. Replaces the separate
// status badge + start/stop button.
export function PipelineStatusToggle({
  pipelineId,
  pipelineState,
}: {
  pipelineId?: string;
  pipelineState?: Pipeline_State;
}) {
  const { mutate: startMutation, isPending: isStartPending } = useStartPipelineMutation();
  const { mutate: stopMutation, isPending: isStopPending } = useStopPipelineMutation();
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);

  const handleStart = useCallback(() => {
    if (!pipelineId) {
      return;
    }
    startMutation(create(StartPipelineRequestSchema, { request: { id: pipelineId } }), {
      onSuccess: () => toast.success('Pipeline started'),
      onError: (err) =>
        toast.error(
          formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'start', entity: 'pipeline' })
        ),
    });
  }, [pipelineId, startMutation]);

  const performStop = useCallback(() => {
    if (!pipelineId) {
      return;
    }
    stopMutation(create(StopPipelineRequestSchema, { request: { id: pipelineId } }), {
      onSuccess: () => {
        toast.success('Pipeline stopped');
        setIsStopConfirmOpen(false);
      },
      onError: (err) => {
        toast.error(formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'stop', entity: 'pipeline' }));
        setIsStopConfirmOpen(false);
      },
    });
  }, [pipelineId, stopMutation]);

  // Switch reflects (and drives) the running state. Starting/stopping are
  // in-flight, so the control is locked until the backend settles.
  const checked = pipelineState === PipelineState.RUNNING || pipelineState === PipelineState.STARTING;
  const isTransitioning = pipelineState === PipelineState.STARTING || pipelineState === PipelineState.STOPPING;
  const isDisabled = !pipelineId || isTransitioning || isStartPending || isStopPending;
  const label = (pipelineState !== undefined && PIPELINE_STATE_LABELS[pipelineState]) || 'Unknown';
  const tone = getTone(pipelineState);

  const handleCheckedChange = useCallback(
    (next: boolean) => {
      if (isDisabled) {
        return;
      }
      if (next) {
        handleStart();
      } else {
        // Stopping halts processing, so gate it behind a confirmation.
        setIsStopConfirmOpen(true);
      }
    },
    [isDisabled, handleStart]
  );

  return (
    <>
      <div className={statusPill({ tone })}>
        <Switch
          aria-label={checked ? 'Stop pipeline' : 'Start pipeline'}
          checked={checked}
          className={cn(tone === 'success' && 'data-[state=checked]:bg-success')}
          disabled={isDisabled}
          onCheckedChange={handleCheckedChange}
          testId="pipeline-run-toggle"
        />
        {isTransitioning ? <Spinner className="size-3.5!" /> : null}
        <span>{label}</span>
      </div>

      <Dialog onOpenChange={setIsStopConfirmOpen} open={isStopConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop pipeline?</DialogTitle>
          </DialogHeader>
          <DialogBody>Stopping the pipeline halts all data processing until you start it again.</DialogBody>
          <DialogFooter>
            <Button onClick={() => setIsStopConfirmOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={isStopPending}
              icon={isStopPending ? <Spinner /> : <StopCircleIcon />}
              onClick={performStop}
              variant="destructive"
            >
              Stop pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
