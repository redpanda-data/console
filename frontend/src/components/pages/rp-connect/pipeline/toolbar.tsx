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
import {
  AlertIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  PlayIcon,
  RotateCwIcon,
  SettingsIcon,
  StopCircleIcon,
} from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { EditableText } from 'components/redpanda-ui/components/editable-text';
import { Group } from 'components/redpanda-ui/components/group';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import type { StatusBadgeVariant } from 'components/redpanda-ui/components/status-badge';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
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
  onViewConfig?: () => void;
  onNameChange?: (name: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
  isLoading?: boolean;
  nameError?: string;
  defaultEditing?: boolean;
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
    icon: <PlayIcon />,
  };
}

function createRunningConfig({ handleStop, isStopPending }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: isStopPending ? <Spinner /> : <StopCircleIcon />,
    text: isStopPending ? 'Stopping' : 'Stop',
    action: handleStop,
  };
}

function createStartingConfig({ handleStart, handleStop }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: <Spinner />,
    text: 'Starting',
    dropdown: [
      { label: 'Try again', icon: <RotateCwIcon />, action: handleStart },
      { label: 'Stop', icon: <StopCircleIcon />, action: handleStop, variant: 'destructive' },
    ],
  };
}

function createStoppingConfig({ handleStop, handleStart }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: <Spinner />,
    text: 'Stopping',
    dropdown: [
      { label: 'Try again', icon: <RotateCwIcon />, action: handleStop },
      { label: 'Start', icon: <PlayIcon />, action: handleStart },
    ],
  };
}

function createErrorConfig({ handleStart }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: <AlertIcon className="h-4 w-4" />,
    text: 'Error',
    dropdown: [{ label: 'Start', icon: <PlayIcon />, action: handleStart }],
  };
}

function createCompletedConfig({ handleStart }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: <RotateCwIcon />,
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

function PipelineActionButton({
  buttonConfig,
  isStartPending,
  isStopPending,
}: {
  buttonConfig: ButtonConfig | null;
  isStartPending: boolean;
  isStopPending: boolean;
}) {
  if (!buttonConfig) {
    return null;
  }

  if (buttonConfig.dropdown) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            {buttonConfig.icon}
            {buttonConfig.text}
            <ChevronDownIcon className="ml-1 h-3 w-3" />
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
      variant="outline"
    >
      {buttonConfig.text}
    </Button>
  );
}

export const Toolbar = memo(
  ({
    pipelineId,
    pipelineName,
    pipelineState,
    mode,
    onEditConfig,
    onViewConfig,
    onNameChange,
    onSave,
    onCancel,
    isSaving,
    isLoading,
    nameError,
    defaultEditing,
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

    const handleEditNavigate = useCallback(() => {
      if (pipelineId) {
        navigate({ to: `/rp-connect/${pipelineId}/edit` });
      }
    }, [pipelineId, navigate]);

    const handleGearClick = useCallback(() => {
      if (mode === 'view') {
        onViewConfig?.();
      } else {
        onEditConfig?.();
      }
    }, [mode, onViewConfig, onEditConfig]);

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

    if (mode === 'view') {
      return (
        <div className="mt-5 flex items-start justify-between">
          <div className="flex gap-2">
            <Button className="mt-1" onClick={handleBack} size="icon" variant="ghost">
              <ArrowLeftIcon className="h-5 w-5" />
            </Button>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <Skeleton className="h-9 w-48" />
                ) : (
                  <Heading level={1}>{pipelineName ?? pipelineId}</Heading>
                )}
                {!isLoading && <Button icon={<SettingsIcon />} onClick={handleGearClick} size="icon" variant="ghost" />}
              </div>
              <Text className="text-muted-foreground">
                Monitor the pipeline, or edit the pipeline configuration to change functionality or improve performance.
              </Text>
              <span className="mt-3">
                <Button onClick={handleEditNavigate}>Edit pipeline</Button>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PipelineActionButton
              buttonConfig={buttonConfig}
              isStartPending={isStartPending}
              isStopPending={isStopPending}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="mt-5 flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button onClick={handleBack} size="icon" variant="ghost">
              <ArrowLeftIcon className="h-5 w-5" />
            </Button>
            {isLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <EditableText
                as="heading"
                className="min-w-[280px]"
                defaultEditing={defaultEditing}
                error={!!nameError}
                errorMessage={nameError}
                headingLevel={1}
                onChange={onNameChange}
                placeholder="Pipeline name"
                value={pipelineName ?? ''}
              />
            )}
            {!isLoading && <Button icon={<SettingsIcon />} onClick={handleGearClick} size="icon" variant="ghost" />}
          </div>
          <Text className="mt-4 ml-9">
            Redpanda Connect builds data pipelines for real-time analytics and actionable business insights. Every
            pipeline requires an input and an output in a config file. Select components, including processors, and
            customize the configuration in the editor.{' '}
            <Link href="https://docs.redpanda.com/redpanda-connect/home/" target="_blank">
              Learn more
            </Link>
          </Text>
        </div>

        <div>
          <Group className="items-center gap-2">
            <Button disabled={isSaving} onClick={onSave}>
              Save
              {Boolean(isSaving) && <Spinner />}
            </Button>
          </Group>
        </div>
      </div>
    );
  }
);

Toolbar.displayName = 'Toolbar';
