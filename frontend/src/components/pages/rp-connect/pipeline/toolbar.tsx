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
import { Button, type ButtonProps } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Group } from 'components/redpanda-ui/components/group';
import { Heading } from 'components/redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { AlertCircle, Check, ChevronDown, Loader2, Pause, Pencil, Play, RotateCcw } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State as PipelineState } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { ReactNode } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { useDeletePipelineMutation, useStartPipelineMutation, useStopPipelineMutation } from 'react-query/api/pipeline';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

type DropdownOption = {
  label: string;
  icon: ReactNode;
  action: () => void;
  variant?: 'default' | 'destructive';
};

type ButtonConfig = {
  icon: ReactNode;
  text: string;
  action?: () => void;
  dropdown?: DropdownOption[];
  variant?: ButtonProps['variant'];
};

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

  const handleStart = useCallback(() => {
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
  }, [pipelineId, startMutation]);

  const handleStop = useCallback(() => {
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
  }, [pipelineId, stopMutation]);

  const handleEdit = useCallback(() => {
    navigate(`/rp-connect/${pipelineId}/edit`);
  }, [navigate, pipelineId]);

  const buttonConfig = useMemo((): ButtonConfig | null => {
    switch (pipelineState) {
      case PipelineState.STOPPED:
        return {
          icon: isStartPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />,
          text: isStartPending ? 'Starting' : 'Start',
          action: handleStart,
          variant: isStartPending ? undefined : 'secondary',
        };
      case PipelineState.RUNNING:
        return {
          icon: isStopPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />,
          text: isStopPending ? 'Stopping' : 'Stop',
          action: handleStop,
          variant: isStopPending ? undefined : 'destructive',
        };
      case PipelineState.STARTING:
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          text: 'Starting',
          dropdown: [
            { label: 'Try again', icon: <RotateCcw className="h-4 w-4" />, action: handleStart },
            { label: 'Stop', icon: <Pause className="h-4 w-4" />, action: handleStop, variant: 'destructive' },
          ],
        };
      case PipelineState.STOPPING:
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          text: 'Stopping',
          dropdown: [
            { label: 'Try again', icon: <RotateCcw className="h-4 w-4" />, action: handleStop },
            { label: 'Start', icon: <Play className="h-4 w-4" />, action: handleStart },
          ],
        };
      case PipelineState.ERROR:
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          text: 'Error',
          dropdown: [{ label: 'Start', icon: <Play className="h-4 w-4" />, action: handleStart }],
        };
      case PipelineState.COMPLETED:
        return {
          icon: <Check className="h-4 w-4" />,
          text: 'Restart',
          action: handleStart,
        };
      default:
        return null;
    }
  }, [pipelineState, handleStart, handleStop, isStartPending, isStopPending]);

  const renderActionButton = useCallback(() => {
    if (!buttonConfig) return null;

    if (buttonConfig.dropdown) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="min-w-[110px]" variant={buttonConfig.variant ?? 'outline'}>
              {buttonConfig.icon}
              {buttonConfig.text}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {buttonConfig.dropdown.map((option) => (
              <DropdownMenuItem key={option.label} onClick={option.action} variant={option.variant}>
                {option.icon}
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <Button
        disabled={isStartPending || isStopPending}
        icon={buttonConfig.icon}
        onClick={buttonConfig.action}
        variant={buttonConfig.variant ?? 'outline'}
      >
        {buttonConfig.text}
      </Button>
    );
  }, [buttonConfig, isStartPending, isStopPending]);

  return (
    <div className="mt-5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Heading level={1}>{pipelineName ?? pipelineId}</Heading>
      </div>

      <div>
        <Group className="items-center">
          {renderActionButton()}
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
