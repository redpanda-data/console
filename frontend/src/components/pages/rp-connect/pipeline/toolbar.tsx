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
import { Button } from 'components/redpanda-ui/components/button';
import { Group } from 'components/redpanda-ui/components/group';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { Pause, Pencil, Play } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State as PipelineState } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useMemo } from 'react';
import { useDeletePipelineMutation, useStartPipelineMutation, useStopPipelineMutation } from 'react-query/api/pipeline';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

type ToolbarProps = {
  pipelineId: string;
  pipelineName?: string;
  pipelineState?: Pipeline_State;
};

export const Toolbar = memo(({ pipelineId, pipelineName, pipelineState }: ToolbarProps) => {
  const navigate = useNavigate();

  const { mutate: deleteMutation, isPending: isDeletePending } = useDeletePipelineMutation();
  const { mutate: startMutation, isPending: isStartPending } = useStartPipelineMutation();
  const { mutate: stopMutation, isPending: isStopPending } = useStopPipelineMutation();

  const isRunning = pipelineState === PipelineState.RUNNING;
  const isTransitioning = pipelineState === PipelineState.STARTING || pipelineState === PipelineState.STOPPING;
  const isActionLoading = isStartPending || isStopPending || isDeletePending;
  const isLoading = isActionLoading || isTransitioning;

  const handleDelete = useCallback(
    (id: string) => {
      const deleteRequest = create(DeletePipelineRequestSchema, {
        request: { id },
      });

      deleteMutation(deleteRequest, {
        onSuccess: () => {
          toast.success('Pipeline deleted');
          navigate('/connect-clusters');
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
    },
    [deleteMutation, navigate]
  );

  const handleStartStop = useCallback(() => {
    if (isRunning) {
      const stopRequest = create(StopPipelineRequestSchema, {
        request: { id: pipelineId },
      });

      stopMutation(stopRequest, {
        onSuccess: () => {
          toast.success('Pipeline stopped');
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
    } else {
      const startRequest = create(StartPipelineRequestSchema, {
        request: { id: pipelineId },
      });

      startMutation(startRequest, {
        onSuccess: () => {
          toast.success('Pipeline started');
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
    }
  }, [pipelineId, isRunning, startMutation, stopMutation]);

  const handleEdit = useCallback(() => {
    navigate(`/rp-connect/${pipelineId}/edit`);
  }, [navigate, pipelineId]);

  const primaryButtonProps = useMemo(() => {
    if (isLoading) {
      return {
        icon: <Spinner size="sm" />,
        children: isRunning ? 'Stopping...' : 'Starting...',
      };
    }
    if (isRunning) {
      return {
        icon: <Pause />,
        children: 'Stop',
      };
    }
    return {
      icon: <Play />,
      children: 'Start',
    };
  }, [isRunning, isLoading]);

  return (
    <div className="flex items-center justify-between">
      <Button disabled={isLoading} onClick={handleStartStop} variant="secondary" {...primaryButtonProps} />

      <div>
        <Group>
          <Button icon={<Pencil />} onClick={handleEdit} variant="outline">
            Edit
          </Button>
          <DeleteResourceAlertDialog
            isDeleting={isDeletePending}
            onDelete={handleDelete}
            resourceId={pipelineId}
            resourceName={pipelineName || 'this pipeline'}
            resourceType="Pipeline"
            triggerVariant="button"
          />
        </Group>
      </div>
    </div>
  );
});

Toolbar.displayName = 'Toolbar';
