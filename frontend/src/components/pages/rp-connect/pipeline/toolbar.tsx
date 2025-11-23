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
import { useToast } from '@redpanda-data/ui';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Group } from 'components/redpanda-ui/components/group';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Pause, Pencil, Play } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State as PipelineState } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useMemo, useState } from 'react';
import { useDeletePipelineMutation, useStartPipelineMutation, useStopPipelineMutation } from 'react-query/api/pipeline';
import { useNavigate } from 'react-router-dom';

import { formatPipelineError } from '../errors';

interface ToolbarProps {
  pipelineId: string;
  pipelineName?: string;
  pipelineState?: Pipeline_State;
}

export const Toolbar = memo(({ pipelineId, pipelineName, pipelineState }: ToolbarProps) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const deleteMutation = useDeletePipelineMutation();
  const startMutation = useStartPipelineMutation();
  const stopMutation = useStopPipelineMutation();

  const isRunning = useMemo(() => pipelineState === PipelineState.RUNNING, [pipelineState]);
  const isTransitioning = useMemo(
    () => pipelineState === PipelineState.STARTING || pipelineState === PipelineState.STOPPING,
    [pipelineState]
  );
  const isActionLoading = useMemo(
    () => startMutation.isPending || stopMutation.isPending || deleteMutation.isPending,
    [startMutation.isPending, stopMutation.isPending, deleteMutation.isPending]
  );
  const isLoading = useMemo(() => isActionLoading || isTransitioning, [isActionLoading, isTransitioning]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    const deleteRequest = create(DeletePipelineRequestSchema, {
      request: { id: pipelineId },
    });

    deleteMutation.mutate(deleteRequest, {
      onSuccess: () => {
        setIsDeleteDialogOpen(false);
        toast({
          status: 'success',
          title: 'Pipeline deleted',
          duration: 4000,
          isClosable: false,
        });
        navigate('/connect-clusters');
      },
      onError: (err) => {
        setIsDeleteDialogOpen(false);
        toast({
          status: 'error',
          title: 'Failed to delete pipeline',
          description: formatPipelineError(err),
          duration: null,
          isClosable: true,
        });
      },
    });
  }, [pipelineId, deleteMutation, toast, navigate]);

  const handleStartStop = useCallback(() => {
    if (isRunning) {
      const stopRequest = create(StopPipelineRequestSchema, {
        request: { id: pipelineId },
      });

      stopMutation.mutate(stopRequest, {
        onSuccess: () => {
          toast({
            status: 'success',
            title: 'Pipeline stopped',
            duration: 4000,
            isClosable: false,
          });
        },
        onError: (err) => {
          toast({
            status: 'error',
            title: 'Failed to stop pipeline',
            description: formatPipelineError(err),
            duration: null,
            isClosable: true,
          });
        },
      });
    } else {
      const startRequest = create(StartPipelineRequestSchema, {
        request: { id: pipelineId },
      });

      startMutation.mutate(startRequest, {
        onSuccess: () => {
          toast({
            status: 'success',
            title: 'Pipeline started',
            duration: 4000,
            isClosable: false,
          });
        },
        onError: (err) => {
          toast({
            status: 'error',
            title: 'Failed to start pipeline',
            description: formatPipelineError(err),
            duration: null,
            isClosable: true,
          });
        },
      });
    }
  }, [pipelineId, isRunning, startMutation, stopMutation, toast]);

  const handleEdit = useCallback(() => {
    navigate(`/rp-connect/${pipelineId}/edit`);
  }, [navigate, pipelineId]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between border-b pb-4">
        <Button
          disabled={isLoading}
          // biome-ignore lint/style/noNestedTernary: because I said so
          icon={isLoading ? <Spinner size="sm" /> : isRunning ? <Pause /> : <Play />}
          onClick={handleStartStop}
          variant="secondary"
        >
          {/** biome-ignore lint/style/noNestedTernary: because I said so */}
          {isLoading ? (isRunning ? 'Stopping...' : 'Starting...') : isRunning ? 'Stop' : 'Start'}
        </Button>

        <div>
          <Group>
            <Button icon={<Pencil />} onClick={handleEdit} variant="outline">
              Edit
            </Button>
            <Button onClick={handleDeleteClick} variant="destructiveOutline">
              Delete
            </Button>
          </Group>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
        <DialogContent size="md" variant="destructive">
          <DialogHeader>
            <DialogTitle>Delete Pipeline</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{pipelineName}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setIsDeleteDialogOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={deleteMutation.isPending} onClick={handleDeleteConfirm} variant="destructive">
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

Toolbar.displayName = 'Toolbar';
