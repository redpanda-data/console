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
  EditIcon,
  PlayIcon,
  RotateCwIcon,
  StopCircleIcon,
} from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import {
  StatusBadge,
  type StatusBadgeSize,
  type StatusBadgeVariant,
} from 'components/redpanda-ui/components/status-badge';
import { Heading } from 'components/redpanda-ui/components/typography';
import { BookOpen, Info } from 'lucide-react';
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
  // Vary emphasis by state: Start is primary (encourage), Stop is neutral.
  variant?: 'primary' | 'secondary' | 'outline';
};

type ToolbarProps = {
  pipelineId?: string;
  mode: 'view' | 'edit' | 'create';
  onViewConfig?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
  isLoading?: boolean;
};

type ButtonConfigFactoryParams = {
  handleStart: () => void;
  handleStop: () => void;
  isStartPending: boolean;
  isStopPending: boolean;
};

function pipelineStateToVariant(state?: Pipeline_State): { variant: StatusBadgeVariant; pulsing: boolean } {
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

const PIPELINE_STATE_LABEL: Partial<Record<Pipeline_State, string>> = {
  [PipelineState.RUNNING]: 'Running',
  [PipelineState.STARTING]: 'Starting',
  [PipelineState.STOPPING]: 'Stopping',
  [PipelineState.STOPPED]: 'Stopped',
  [PipelineState.ERROR]: 'Error',
  [PipelineState.COMPLETED]: 'Completed',
};

export function PipelineStatusBadge({ state, size }: { state?: Pipeline_State; size?: StatusBadgeSize }) {
  const { variant, pulsing } = pipelineStateToVariant(state);
  return (
    <StatusBadge pulsing={pulsing} size={size} variant={variant}>
      {(state !== undefined && PIPELINE_STATE_LABEL[state]) || 'Unknown'}
    </StatusBadge>
  );
}

function createStoppedConfig({ handleStart, isStartPending }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    text: isStartPending ? 'Starting' : 'Start',
    action: handleStart,
    icon: <PlayIcon />,
    variant: 'primary',
  };
}

function createRunningConfig({ handleStop, isStopPending }: ButtonConfigFactoryParams): ButtonConfig {
  return {
    icon: isStopPending ? <Spinner /> : <StopCircleIcon />,
    text: isStopPending ? 'Stopping' : 'Stop',
    action: handleStop,
    variant: 'outline',
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
    variant: 'secondary',
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
      variant={buttonConfig.variant ?? 'outline'}
    >
      {buttonConfig.text}
    </Button>
  );
}

// Start/stop control for a pipeline. Lives outside the toolbar so it can be
// placed in the page body (e.g. the summary card) rather than next to Edit.
export function PipelineRunControl({
  pipelineId,
  pipelineState,
}: {
  pipelineId?: string;
  pipelineState?: Pipeline_State;
}) {
  const { mutate: startMutation, isPending: isStartPending } = useStartPipelineMutation();
  const { mutate: stopMutation, isPending: isStopPending } = useStopPipelineMutation();

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

  const handleStop = useCallback(() => {
    if (!pipelineId) {
      return;
    }
    stopMutation(create(StopPipelineRequestSchema, { request: { id: pipelineId } }), {
      onSuccess: () => toast.success('Pipeline stopped'),
      onError: (err) =>
        toast.error(formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'stop', entity: 'pipeline' })),
    });
  }, [pipelineId, stopMutation]);

  const buttonConfig = useMemo(
    () => getPipelineButtonConfig(pipelineState, { handleStart, handleStop, isStartPending, isStopPending }),
    [pipelineState, handleStart, handleStop, isStartPending, isStopPending]
  );

  return (
    <PipelineActionButton buttonConfig={buttonConfig} isStartPending={isStartPending} isStopPending={isStopPending} />
  );
}

export const Toolbar = memo(
  ({ pipelineId, mode, onViewConfig, onSave, onCancel, isSaving, isLoading }: ToolbarProps) => {
    const navigate = useNavigate();

    const handleBack = useCallback(() => {
      if (onCancel) {
        onCancel();
      } else {
        navigate({ to: '/connect-clusters', search: {} as never });
      }
    }, [onCancel, navigate]);

    const handleEditNavigate = useCallback(() => {
      if (pipelineId) {
        navigate({ to: `/rp-connect/${pipelineId}/edit` });
      }
    }, [pipelineId, navigate]);

    if (mode === 'view') {
      return (
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button className="shrink-0" onClick={handleBack} size="icon" variant="ghost">
              <ArrowLeftIcon className="h-5 w-5" />
            </Button>
            <Heading level={1}>Pipeline view</Heading>
            {!isLoading && (
              <Button
                aria-label="View pipeline details"
                icon={<Info />}
                onClick={onViewConfig}
                size="icon"
                variant="ghost"
              />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button icon={<EditIcon />} onClick={handleEditNavigate}>
              Edit pipeline
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button className="shrink-0" onClick={handleBack} size="icon" variant="ghost">
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          {/* Name, description and compute units all live in the settings section below. */}
          <Heading level={1}>{mode === 'create' ? 'New pipeline' : 'Editing pipeline'}</Heading>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            as="a"
            href="https://docs.redpanda.com/redpanda-connect/home/"
            icon={<BookOpen />}
            rel="noopener noreferrer"
            target="_blank"
            variant="ghost"
          >
            Docs
          </Button>
          <Button disabled={isSaving} onClick={onSave}>
            Save
            {Boolean(isSaving) && <Spinner />}
          </Button>
        </div>
      </div>
    );
  }
);

Toolbar.displayName = 'Toolbar';
