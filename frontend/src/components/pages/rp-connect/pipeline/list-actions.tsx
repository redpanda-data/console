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
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { DeleteDraftDialog } from './delete-draft-dialog';
import type { PipelineRow } from './list-row';
import { useStartDraftConfirm } from './start-draft-dialog';

type ActionsCellProps = {
  pipeline: PipelineRow;
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: ReturnType<typeof useDeletePipelineMutation>['mutate'];
  startMutation: ReturnType<typeof useStartPipelineMutation>['mutate'];
  stopMutation: ReturnType<typeof useStopPipelineMutation>['mutate'];
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

    const handleStart = () => {
      const startRequest = create(StartPipelineRequestSchema, {
        request: { id: pipeline.id },
      });
      startMutation(startRequest, {
        onSuccess: () => {
          toast.success('Pipeline starting');
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({
              error: ConnectError.from(err),
              action: 'start',
              entity: 'pipeline',
            })
          );
        },
      });
    };

    const handleStop = () => {
      const stopRequest = create(StopPipelineRequestSchema, {
        request: { id: pipeline.id },
      });
      stopMutation(stopRequest, {
        onSuccess: () => {
          toast.success('Pipeline stopping');
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({
              error: ConnectError.from(err),
              action: 'stop',
              entity: 'pipeline',
            })
          );
        },
      });
    };

    const handleDelete = (id: string) => {
      const deleteRequest = create(DeletePipelineRequestSchema, {
        request: { id },
      });

      deleteMutation(deleteRequest, {
        onSuccess: () => {
          rpcnEditorAutosave.clear(autosaveTargetKey(id));
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
            {isStarting ? <DropdownMenuItem onClick={handleStart}>Retry start</DropdownMenuItem> : null}
            {isStopping ? <DropdownMenuItem onClick={handleStop}>Retry stop</DropdownMenuItem> : null}
            {canStart ? <DropdownMenuItem onClick={handleStart}>Start</DropdownMenuItem> : null}
            {canStop ? <DropdownMenuItem onClick={handleStop}>Stop</DropdownMenuItem> : null}
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
            onConfirm={() => handleDelete(pipeline.id)}
            onOpenChange={setIsDeleteDialogOpen}
            open={isDeleteDialogOpen}
          />
        ) : (
          <DeleteResourceAlertDialog
            isDeleting={isDeletingPipeline}
            onDelete={handleDelete}
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
