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
import { useNavigate } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { EditableText } from 'components/redpanda-ui/components/editable-text';
import { Group } from 'components/redpanda-ui/components/group';
import { Kbd } from 'components/redpanda-ui/components/kbd';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusBadge, type StatusBadgeVariant } from 'components/redpanda-ui/components/status-badge';
import { Heading } from 'components/redpanda-ui/components/typography';
import {
  AlertCircle,
  ArrowBigUp,
  ArrowLeft,
  Check,
  ChevronDown,
  Command,
  Loader2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Settings,
} from 'lucide-react';
import {
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State as PipelineState } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { ReactNode } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { useStartPipelineMutation, useStopPipelineMutation } from 'react-query/api/pipeline';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

type DropdownOption = {
  label: string;
  icon: ReactNode;
  action: () => void;
  variant?: 'default' | 'destructive';
};

type ButtonConfig = {
  icon?: ReactNode;
  text: string;
  action?: () => void;
  dropdown?: DropdownOption[];
};

type ToolbarProps = {
  pipelineId?: string;
  pipelineName?: string;
  pipelineState?: Pipeline_State;
  mode: 'view' | 'edit' | 'create';
  onEditConfig?: () => void;
  onNameChange?: (name: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  onCommandMenu?: () => void;
  isSaving?: boolean;
  isLoading?: boolean;
  nameError?: string;
  autoFocus?: boolean;
};

type ButtonConfigFactoryParams = {
  handleStart: () => void;
  handleStop: () => void;
  isStartPending: boolean;
  isStopPending: boolean;
};

export function pipelineStateToVariant(state?: Pipeline_State): { variant: StatusBadgeVariant; pulsing: boolean } {
  switch (state) {
    case PipelineState.RUNNING:
      return { variant: 'success', pulsing: true };
    case PipelineState.STARTING:
      return { variant: 'starting', pulsing: false };
    case PipelineState.STOPPING:
      return { variant: 'stopping', pulsing: false };
    case PipelineState.STOPPED:
      return { variant: 'disabled', pulsing: false };
    case PipelineState.ERROR:
      return { variant: 'error', pulsing: false };
    case PipelineState.COMPLETED:
      return { variant: 'success', pulsing: false };
    default:
      return { variant: 'info', pulsing: false };
  }
}

function createStoppedConfig({ handleStart, isStartPending }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    text: isStartPending ? 'Starting' : 'Start',
    action: handleStart,
  };
}

function createRunningConfig({ handleStop, isStopPending }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: isStopPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />,
    text: isStopPending ? 'Stopping' : 'Stop',
    action: handleStop,
  };
}

function createStartingConfig({ handleStart, handleStop }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    text: 'Starting',
    dropdown: [
      { label: 'Try again', icon: <RotateCcw className="h-4 w-4" />, action: handleStart },
      { label: 'Stop', icon: <Pause className="h-4 w-4" />, action: handleStop, variant: 'destructive' },
    ],
  };
}

function createStoppingConfig({ handleStop, handleStart }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    text: 'Stopping',
    dropdown: [
      { label: 'Try again', icon: <RotateCcw className="h-4 w-4" />, action: handleStop },
      { label: 'Start', icon: <Play className="h-4 w-4" />, action: handleStart },
    ],
  };
}

function createErrorConfig({ handleStart }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: <AlertCircle className="h-4 w-4" />,
    text: 'Error',
    dropdown: [{ label: 'Start', icon: <Play className="h-4 w-4" />, action: handleStart }],
  };
}

function createCompletedConfig({ handleStart }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: <Check className="h-4 w-4" />,
    text: 'Restart',
    action: handleStart,
  };
}

function getPipelineButtonConfig(
  pipelineState: Pipeline_State | undefined,
  params: ButtonConfigFactoryParams
): ButtonConfig | null {
  switch (pipelineState) {
    case PipelineState.STOPPED:
      return createStoppedConfig(params);
    case PipelineState.RUNNING:
      return createRunningConfig(params);
    case PipelineState.STARTING:
      return createStartingConfig(params);
    case PipelineState.STOPPING:
      return createStoppingConfig(params);
    case PipelineState.ERROR:
      return createErrorConfig(params);
    case PipelineState.COMPLETED:
      return createCompletedConfig(params);
    default:
      return null;
  }
}

export const Toolbar = memo(
  ({
    pipelineId,
    pipelineName,
    pipelineState,
    mode,
    onEditConfig,
    onNameChange,
    onSave,
    onCancel,
    onCommandMenu,
    isSaving,
    isLoading,
    nameError,
    autoFocus,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Toolbar renders multiple conditional UI states
  }: ToolbarProps) => {
    const navigate = useNavigate();

    const { mutate: startMutation, isPending: isStartPending } = useStartPipelineMutation();
    const { mutate: stopMutation, isPending: isStopPending } = useStopPipelineMutation();

    const handleBack = useCallback(() => {
      if (onCancel) {
        onCancel();
      } else {
        navigate({ to: '/connect-clusters' });
      }
    }, [onCancel, navigate]);

    const handleStart = useCallback(() => {
      if (!pipelineId) {
        return;
      }
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
      if (!pipelineId) {
        return;
      }
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

    const handleEditClick = useCallback(() => {
      if (mode === 'view' && pipelineId) {
        navigate({ to: `/rp-connect/${pipelineId}/edit` });
      } else {
        onEditConfig?.();
      }
    }, [mode, pipelineId, navigate, onEditConfig]);

    const statusBadge = useMemo(() => pipelineStateToVariant(pipelineState), [pipelineState]);
    const shouldShowStatusBadge = useMemo(
      () =>
        mode === 'view' &&
        pipelineState !== undefined &&
        pipelineState !== PipelineState.STARTING &&
        pipelineState !== PipelineState.STOPPING,
      [mode, pipelineState]
    );

    const buttonConfig = useMemo(
      () =>
        getPipelineButtonConfig(pipelineState, {
          handleStart,
          handleStop,
          isStartPending,
          isStopPending,
        }),
      [pipelineState, handleStart, handleStop, isStartPending, isStopPending]
    );

    const renderActionButton = useCallback(() => {
      if (!buttonConfig) {
        return null;
      }

      if (buttonConfig.dropdown) {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
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
        <Button disabled={isStartPending || isStopPending} icon={buttonConfig.icon} onClick={buttonConfig.action}>
          {buttonConfig.text}
        </Button>
      );
    }, [buttonConfig, isStartPending, isStopPending]);

    const isEditable = mode === 'edit' || mode === 'create';
    const displayName = pipelineName || pipelineId || '';

    return (
      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button onClick={handleBack} size="icon" variant="ghost">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {isLoading ? (
            <Skeleton className="h-9 w-48" />
          ) : isEditable ? (
            <EditableText
              as="heading"
              autoFocus={autoFocus}
              error={!!nameError}
              errorMessage={nameError}
              headingLevel={1}
              onChange={onNameChange}
              placeholder="New pipeline"
              value={displayName}
            />
          ) : (
            <Heading level={1}>{displayName || 'New pipeline'}</Heading>
          )}
          {!isLoading && (
            <Button
              icon={mode === 'view' ? <Pencil /> : <Settings />}
              onClick={handleEditClick}
              size="icon"
              variant="ghost"
            />
          )}
        </div>

        <div>
          <Group className="items-center gap-2">
            {isEditable && onCommandMenu ? (
              <Button
                icon={
                  <Kbd variant="ghost">
                    <Command />
                    <ArrowBigUp />P
                  </Kbd>
                }
                onClick={onCommandMenu}
                variant="outline"
              >
                Insert
              </Button>
            ) : null}
            {shouldShowStatusBadge ? <StatusBadge pulsing={statusBadge.pulsing} variant={statusBadge.variant} /> : null}
            {mode === 'view' && renderActionButton()}

            {(mode === 'edit' || mode === 'create') && (
              <Button disabled={isSaving} onClick={onSave}>
                Save
                {Boolean(isSaving) && <Spinner />}
              </Button>
            )}
          </Group>
        </div>
      </div>
    );
  }
);

Toolbar.displayName = 'Toolbar';
