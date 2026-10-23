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
import type { useNavigate } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { DeleteResourceAlertDialog, DeleteResourceMenuItem } from 'components/ui/delete-resource-alert-dialog';
import { STARTABLE_STATES, STOPPABLE_STATES } from 'components/ui/pipeline/constants';
import { MoreHorizontal } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useState } from 'react';
import type {
  useDeletePipelineMutation,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';
import { toast } from 'sonner';
import {
  autosaveTargetKey,
  rpcnEditorAutosave,
  selectAutosaveEntry,
  useRpcnEditorAutosaveStore,
} from 'state/rpcn-editor-autosave';
import { useRunHistoryStore } from 'state/rpcn-run-history-preview';
import { useSchedulePreviewStore } from 'state/rpcn-schedule-preview';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { DeleteDraftDialog } from './delete-draft-dialog';
import type { PipelineRow } from './list-row';
import { useStartDraftConfirm } from './start-draft-dialog';
import { startRecordsRun } from '../utils/pipeline-runs';
import { describeSchedule } from '../utils/pipeline-schedule';

export type DeleteMutate = ReturnType<typeof useDeletePipelineMutation>['mutate'];

// Async: rows share one mutation, and `mutate` drops the callbacks of a call another replaces.
export type StartMutate = ReturnType<typeof useStartPipelineMutation>['mutateAsync'];

export type StopMutate = ReturnType<typeof useStopPipelineMutation>['mutateAsync'];

// A schedule's one extra run, for a pipeline whose runs end.
const runsNow = (pipeline: PipelineRow) => pipeline.schedule !== undefined && pipeline.end === 'finite';

const startPipeline = (startMutation: StartMutate, pipeline: PipelineRow) => {
  const startRequest = create(StartPipelineRequestSchema, {
    request: { id: pipeline.id },
  });
  const startedAt = Date.now();
  startMutation(startRequest)
    .then(() => {
      if (startRecordsRun(pipeline.end)) {
        useRunHistoryStore.getState().startManualRun(pipeline.id, { now: startedAt });
      }
      toast.success(runsNow(pipeline) ? 'Run starting' : 'Pipeline starting');
    })
    .catch((err) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error: ConnectError.from(err),
          action: 'start',
          entity: 'pipeline',
        })
      );
    });
};

const stopPipeline = (stopMutation: StopMutate, id: string) => {
  const stopRequest = create(StopPipelineRequestSchema, {
    request: { id },
  });
  stopMutation(stopRequest)
    .then(() => {
      useRunHistoryStore.getState().requestStop(id);
      toast.success('Pipeline stopping');
    })
    .catch((err) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error: ConnectError.from(err),
          action: 'stop',
          entity: 'pipeline',
        })
      );
    });
};

const deletePipeline = (deleteMutation: DeleteMutate, id: string, isDraftRow: boolean) => {
  const deleteRequest = create(DeletePipelineRequestSchema, {
    request: { id },
  });

  deleteMutation(deleteRequest, {
    onSuccess: () => {
      rpcnEditorAutosave.clear(autosaveTargetKey(id));
      useSchedulePreviewStore.getState().removeSchedule(id);
      useRunHistoryStore.getState().replaceRuns(id, []);
      toast.success(isDraftRow ? 'Draft deleted' : 'Pipeline deleted');
    },
    onError: (err) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error: ConnectError.from(err),
          action: 'delete',
          entity: 'pipeline',
        })
      );
    },
  });
};

type ActionsCellProps = {
  pipeline: PipelineRow;
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: DeleteMutate;
  startMutation: StartMutate;
  stopMutation: StopMutate;
  isDeletingPipeline: boolean;
  /** Set with the schedule preview on. */
  onEditSchedule?: (pipelineId: string) => void;
};

// Set or edit the schedule, and pause or resume it in place.
function ScheduleMenuItems({
  pipeline,
  onEditSchedule,
}: {
  pipeline: PipelineRow;
  onEditSchedule: (pipelineId: string) => void;
}) {
  const saveSchedule = useSchedulePreviewStore((s) => s.saveSchedule);
  const schedule = pipeline.schedule?.schedule;
  const setEnabled = (enabled: boolean) => {
    if (!schedule) {
      return;
    }
    saveSchedule(pipeline.id, { ...schedule, enabled });
    toast.success(enabled ? 'Schedule resumed' : 'Schedule paused', {
      description: enabled ? describeSchedule(schedule) : undefined,
    });
  };
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onEditSchedule(pipeline.id)}>
        {schedule ? 'Edit schedule' : 'Add schedule'}
      </DropdownMenuItem>
      {schedule?.enabled ? <DropdownMenuItem onClick={() => setEnabled(false)}>Pause schedule</DropdownMenuItem> : null}
      {/* Back on for a pipeline that doesn't stop on its own, it would only sit on hold; Edit says why. */}
      {schedule && !schedule.enabled && pipeline.end === 'finite' ? (
        <DropdownMenuItem onClick={() => setEnabled(true)}>Resume schedule</DropdownMenuItem>
      ) : null}
    </>
  );
}

export const ActionsCell = memo(
  ({
    pipeline,
    navigate,
    deleteMutation,
    startMutation,
    stopMutation,
    isDeletingPipeline,
    onEditSchedule,
  }: ActionsCellProps) => {
    const isDraftRow = pipeline.isDraft;
    const canStart = !isDraftRow && (STARTABLE_STATES as readonly Pipeline_State[]).includes(pipeline.state);
    const canStop = !isDraftRow && (STOPPABLE_STATES as readonly Pipeline_State[]).includes(pipeline.state);
    const isStarting = pipeline.state === Pipeline_State.STARTING;
    const isStopping = pipeline.state === Pipeline_State.STOPPING;
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { requestStart, isStartingDraft, confirmDialog } = useStartDraftConfirm({
      id: pipeline.id,
      configYaml: pipeline.configYaml,
      computeUnits: pipeline.computeUnits,
    });
    // The dialog says so when this browser also holds unsaved edits for the draft.
    const hasUnsavedChanges = useRpcnEditorAutosaveStore(
      (s) => isDraftRow && selectAutosaveEntry(s.entries, autosaveTargetKey(pipeline.id)) !== null
    );

    return (
      <div className="flex min-w-[68px] justify-end" data-actions-column>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button className="size-8" size="icon" variant="ghost">
                <MoreHorizontal />
                <span className="sr-only">Open menu</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: '/rp-connect/$pipelineId/edit',
                  params: { pipelineId: encodeURIComponent(pipeline.id) },
                })
              }
            >
              {isDraftRow ? 'Continue editing' : 'Edit'}
            </DropdownMenuItem>
            {isDraftRow ? (
              <DropdownMenuItem disabled={isStartingDraft} onClick={requestStart}>
                Start
              </DropdownMenuItem>
            ) : null}
            {isStarting ? (
              <DropdownMenuItem onClick={() => startPipeline(startMutation, pipeline)}>Retry start</DropdownMenuItem>
            ) : null}
            {isStopping ? (
              <DropdownMenuItem onClick={() => stopPipeline(stopMutation, pipeline.id)}>Retry stop</DropdownMenuItem>
            ) : null}
            {/* With a schedule, starting it is a single run; the schedule carries on. */}
            {canStart ? (
              <DropdownMenuItem onClick={() => startPipeline(startMutation, pipeline)}>
                {runsNow(pipeline) ? 'Run now' : 'Start'}
              </DropdownMenuItem>
            ) : null}
            {canStop ? (
              <DropdownMenuItem onClick={() => stopPipeline(stopMutation, pipeline.id)}>Stop</DropdownMenuItem>
            ) : null}
            {onEditSchedule ? <ScheduleMenuItems onEditSchedule={onEditSchedule} pipeline={pipeline} /> : null}
            <DropdownMenuSeparator />
            <DeleteResourceMenuItem
              isDeleting={isDeletingPipeline}
              onSelect={() => setIsDeleteDialogOpen(true)}
              text={isDraftRow ? 'Delete draft' : undefined}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {isDraftRow ? confirmDialog : null}
        {isDraftRow ? (
          <DeleteDraftDialog
            draftName={pipeline.name}
            hasUnsavedChanges={hasUnsavedChanges}
            isDeleting={isDeletingPipeline}
            onConfirm={() => deletePipeline(deleteMutation, pipeline.id, isDraftRow)}
            onOpenChange={setIsDeleteDialogOpen}
            open={isDeleteDialogOpen}
          />
        ) : (
          <DeleteResourceAlertDialog
            isDeleting={isDeletingPipeline}
            onDelete={(id) => deletePipeline(deleteMutation, id, isDraftRow)}
            onOpenChange={setIsDeleteDialogOpen}
            open={isDeleteDialogOpen}
            resourceId={pipeline.id}
            resourceName={pipeline.name}
            resourceType="Pipeline"
          />
        )}
      </div>
    );
  }
);

ActionsCell.displayName = 'ActionsCell';
