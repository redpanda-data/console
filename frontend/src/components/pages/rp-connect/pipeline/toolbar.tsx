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
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State as PipelineState } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback } from 'react';
import { useDeletePipelineMutation, useStartPipelineMutation, useStopPipelineMutation } from 'react-query/api/pipeline';
import { useNavigate } from 'react-router-dom';

import { formatPipelineError } from '../errors';

interface ToolbarProps {
  mode: 'create' | 'edit' | 'view';
  pipelineId?: string;
  pipelineName?: string;
  pipelineState?: Pipeline_State;
  onSave?: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
}

export function Toolbar({ mode, pipelineId, pipelineName, pipelineState, onSave, onCancel, isSaving }: ToolbarProps) {
  const navigate = useNavigate();
  const toast = useToast();

  // Call mutations locally instead of receiving via props
  const deleteMutation = useDeletePipelineMutation();
  const startMutation = useStartPipelineMutation();
  const stopMutation = useStopPipelineMutation();

  const isRunning = pipelineState === PipelineState.RUNNING;
  const isTransitioning = pipelineState === PipelineState.STARTING || pipelineState === PipelineState.STOPPING;
  const isActionLoading = startMutation.isPending || stopMutation.isPending || deleteMutation.isPending;

  const handleDelete = useCallback(() => {
    if (!pipelineId) {
      return;
    }

    // biome-ignore lint: User confirmation required for destructive action
    if (window.confirm(`Delete pipeline "${pipelineName}"?`)) {
      const deleteRequest = create(DeletePipelineRequestSchema, {
        request: { id: pipelineId },
      });

      deleteMutation.mutate(deleteRequest, {
        onSuccess: () => {
          toast({
            status: 'success',
            title: 'Pipeline deleted',
            duration: 4000,
            isClosable: false,
          });
          navigate('/connect-clusters');
        },
        onError: (err) => {
          toast({
            status: 'error',
            title: 'Failed to delete pipeline',
            description: formatPipelineError(err),
            duration: null,
            isClosable: true,
          });
        },
      });
    }
  }, [pipelineId, pipelineName, deleteMutation, toast, navigate]);

  const handleStartStop = useCallback(() => {
    if (!pipelineId) {
      return;
    }

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

  const handleCancel = useCallback(() => {
    onCancel?.();
    navigate(-1);
  }, [navigate, onCancel]);

  return (
    <div className="mb-4 flex items-center justify-between border-b pb-4">
      <div className="flex items-center gap-2">
        {mode === 'view' && (
          <>
            <Button onClick={handleEdit} variant="default">
              Edit
            </Button>
            <Button disabled={isActionLoading || isTransitioning} onClick={handleStartStop} variant="outline">
              {isRunning ? 'Stop' : 'Start'}
            </Button>
            <Button onClick={handleDelete} variant="destructive">
              Delete
            </Button>
          </>
        )}

        {(mode === 'edit' || mode === 'create') && (
          <>
            <Button disabled={isSaving} onClick={onSave}>
              {mode === 'create' ? 'Create Pipeline' : 'Update Pipeline'}
            </Button>
            <Button onClick={handleCancel} variant="outline">
              Cancel
            </Button>
          </>
        )}
      </div>

      {/* Mode indicator using ToggleGroup (visual only) */}
      {mode !== 'create' && (
        <ToggleGroup className="pointer-events-none opacity-60" type="single" value={mode}>
          <ToggleGroupItem value="view">View</ToggleGroupItem>
          <ToggleGroupItem value="edit">Edit</ToggleGroupItem>
        </ToggleGroup>
      )}
    </div>
  );
}
