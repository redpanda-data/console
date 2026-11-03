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
import {
  autosaveTargetKey,
  rpcnEditorAutosave,
  selectAutosaveEntry,
  useRpcnEditorAutosaveStore,
} from 'state/rpcn-editor-autosave';
import { formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

import { DeleteDraftDialog } from './delete-draft-dialog';
import type { PipelineRow } from './list-row';
import { useStartDraftConfirm } from './start-draft-dialog';

export type DeleteMutate = ReturnType<typeof useDeletePipelineMutation>['mutate'];

// Async: rows share one mutation, and `mutate` drops the callbacks of a call another replaces.
export type StartMutate = ReturnType<typeof useStartPipelineMutation>['mutateAsync'];

export type StopMutate = ReturnType<typeof useStopPipelineMutation>['mutateAsync'];

const toastPipelineError = (action: 'start' | 'stop' | 'delete') => (err: unknown) =>
  showToast({
    status: 'error',
    title: formatToastErrorMessageGRPC({ error: ConnectError.from(err), action, entity: 'pipeline' }),
  });

const startPipeline = (startMutation: StartMutate, id: string) => {
  startMutation(create(StartPipelineRequestSchema, { request: { id } }))
    .then(() => showToast({ status: 'success', title: 'Pipeline starting' }))
    .catch(toastPipelineError('start'));
};

const stopPipeline = (stopMutation: StopMutate, id: string) => {
  stopMutation(create(StopPipelineRequestSchema, { request: { id } }))
    .then(() => showToast({ status: 'success', title: 'Pipeline stopping' }))
    .catch(toastPipelineError('stop'));
};

const deletePipeline = (deleteMutation: DeleteMutate, id: string, isDraftRow: boolean) => {
  deleteMutation(create(DeletePipelineRequestSchema, { request: { id } }), {
    onSuccess: () => {
      rpcnEditorAutosave.clear(autosaveTargetKey(id));
      showToast({ status: 'success', title: isDraftRow ? 'Draft deleted' : 'Pipeline deleted' });
    },
    onError: toastPipelineError('delete'),
  });
};

type ActionsCellProps = {
  pipeline: PipelineRow;
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: DeleteMutate;
  startMutation: StartMutate;
  stopMutation: StopMutate;
  isDeletingPipeline: boolean;
};

export const ActionsCell = memo(
  ({ pipeline, navigate, deleteMutation, startMutation, stopMutation, isDeletingPipeline }: ActionsCellProps) => {
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
              <DropdownMenuItem onClick={() => startPipeline(startMutation, pipeline.id)}>Retry start</DropdownMenuItem>
            ) : null}
            {isStopping ? (
              <DropdownMenuItem onClick={() => stopPipeline(stopMutation, pipeline.id)}>Retry stop</DropdownMenuItem>
            ) : null}
            {canStart ? (
              <DropdownMenuItem onClick={() => startPipeline(startMutation, pipeline.id)}>Start</DropdownMenuItem>
            ) : null}
            {canStop ? (
              <DropdownMenuItem onClick={() => stopPipeline(stopMutation, pipeline.id)}>Stop</DropdownMenuItem>
            ) : null}
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
