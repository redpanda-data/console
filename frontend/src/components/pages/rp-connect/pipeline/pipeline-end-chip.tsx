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

import type { ComponentName } from 'assets/connectors/component-logo-map';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertTriangle, Box, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { RichText, StopKindIcon } from './stop-condition';
import { claimEscape } from './stop-form';
import { ConnectorLogo } from '../onboarding/connector-logo';
import type {
  InputEndBehavior,
  InputEndKind,
  PipelineEndStatus,
  PipelineEndSummary,
} from '../utils/input-end-behavior';
import type { InputEndRow } from '../utils/pipeline-flow-parser';
import { stopSummary } from '../utils/read-until';

const STATUS_COPY: Record<Exclude<PipelineEndStatus, 'none'>, { label: string; detail: string }> = {
  finite: {
    label: 'Stops on its own',
    detail:
      'Every input has a way to finish. Once they have all stopped, the pipeline stops itself and uses no compute.',
  },
  continuous: {
    label: 'Runs continuously',
    detail: 'Add a stop condition so the pipeline can finish by itself.',
  },
  invalid: {
    label: 'Stop condition incomplete',
    detail: 'Fix it so the pipeline can start and finish.',
  },
  unknown: {
    label: 'May not stop on its own',
    detail: 'Add a stop condition to be sure the pipeline finishes.',
  },
};

const STATUS_KIND: Record<Exclude<PipelineEndStatus, 'none'>, InputEndKind> = {
  finite: 'natural',
  continuous: 'continuous',
  invalid: 'invalid',
  unknown: 'unknown',
};

const CHIP_TONE: Record<Exclude<PipelineEndStatus, 'none'>, string> = {
  finite: 'border-success/40 text-success',
  continuous: 'border-border text-foreground',
  invalid: 'border-destructive/50 text-destructive',
  unknown: 'border-border text-foreground',
};

const ROW_TONE: Record<InputEndKind, string> = {
  condition: 'text-success',
  natural: 'text-success',
  continuous: 'text-muted-foreground',
  invalid: 'text-destructive',
  unknown: 'text-muted-foreground',
};

/**
 * Whether the whole pipeline ends by itself (its top-level input does), as a canvas chip that opens a
 * per-input breakdown; picking an input selects it on the canvas.
 */
export function PipelineEndChip({
  status,
  behavior,
  rows,
  onSelectInput,
}: {
  status: PipelineEndStatus;
  behavior?: InputEndBehavior;
  rows: InputEndRow[];
  onSelectInput: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (status === 'none') {
    return null;
  }
  const copy = STATUS_COPY[status];
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label={`How this pipeline ends: ${copy.label}`}
            className={cn(
              'flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-background/90 px-2.5 font-medium text-body-sm shadow-sm backdrop-blur-sm transition-colors hover:bg-muted',
              CHIP_TONE[status]
            )}
            data-status={status}
            data-testid="pipeline-end-chip"
            type="button"
          />
        }
      >
        <StopKindIcon className={cn('size-3.5', status === 'finite' && 'fill-current')} kind={STATUS_KIND[status]} />
        {copy.label}
        <ChevronDown className={cn('size-3.5 opacity-60 transition-transform', open && 'rotate-180')} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" onKeyDown={claimEscape} side="bottom">
        <div className="flex flex-col gap-1 border-border border-b px-4 py-3">
          <span className="font-semibold text-body">How this pipeline ends</span>
          <span className="text-body-sm text-muted-foreground">
            {status === 'finite' || !behavior ? copy.detail : <RichText text={`${behavior.reason} ${copy.detail}`} />}
          </span>
          {status === 'finite' && behavior?.caveat ? (
            <span className="flex items-start gap-1 text-body-sm text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <RichText text={behavior.caveat} />
              </span>
            </span>
          ) : null}
        </div>
        <ul aria-label="Inputs" className="flex max-h-72 flex-col overflow-y-auto p-1">
          {rows.map((row) => {
            const { short, long } = stopSummary(row.slot, row.effective);
            return (
              <li key={row.id}>
                <button
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted',
                    row.nested && 'pl-6'
                  )}
                  onClick={() => {
                    setOpen(false);
                    onSelectInput(row.id);
                  }}
                  title={long}
                  type="button"
                >
                  <ConnectorLogo className="size-4 shrink-0" fallback={Box} name={row.name as ComponentName} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-body-sm">{row.labelText ?? row.name}</span>
                    {row.labelText ? (
                      <span className="truncate font-mono text-2xs text-muted-foreground">{row.name}</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'flex shrink-0 items-center gap-1 font-medium text-body-sm',
                      ROW_TONE[row.effective.kind]
                    )}
                  >
                    <StopKindIcon
                      className={cn('size-3.5', row.effective.kind === 'condition' && 'fill-current')}
                      kind={row.effective.kind}
                    />
                    {short}
                    {row.effective.caveat ? (
                      <AlertTriangle aria-label="Might keep running" className="size-3.5 text-warning" />
                    ) : null}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** The pipeline's end status for a page header's meta row; the reason is its tooltip. */
export function PipelineEndMeta({ summary }: { summary: PipelineEndSummary }) {
  if (summary.status === 'none') {
    return null;
  }
  const copy = STATUS_COPY[summary.status];
  const reason = summary.behavior?.reason;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex items-center gap-1.5" data-testid="pipeline-end-meta" />}>
        <StopKindIcon
          className={cn(
            'size-3.5',
            summary.status === 'finite' && 'fill-current text-success',
            summary.status === 'invalid' && 'text-destructive'
          )}
          kind={STATUS_KIND[summary.status]}
        />
        {copy.label}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {reason ? <RichText text={`${reason} ${copy.detail}`} /> : copy.detail}
        {summary.behavior?.caveat ? (
          <span className="mt-1 block">
            <RichText text={summary.behavior.caveat} />
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

// How a pipeline runs, as the list says it: "runs until done", "runs continuously", …
const RUNS_COPY: Record<Exclude<PipelineEndStatus, 'none'>, { label: string; tone: string }> = {
  finite: { label: 'Until done', tone: 'text-success' },
  continuous: { label: 'Continuously', tone: 'text-muted-foreground' },
  invalid: { label: 'Stop incomplete', tone: 'text-destructive' },
  unknown: { label: 'Unknown', tone: 'text-muted-foreground' },
};

const runsIcon = (status: Exclude<PipelineEndStatus, 'none'>) => {
  const RunsIcon = ({ className }: { className?: string }) => (
    <StopKindIcon
      className={cn(className, RUNS_COPY[status].tone, status === 'finite' && 'fill-current')}
      kind={STATUS_KIND[status]}
    />
  );
  return RunsIcon;
};

const NoInputIcon = ({ className }: { className?: string }) => (
  <Box className={cn(className, 'text-muted-foreground')} />
);

/** The list's "Runs" filter options, in the order they read; `none` is a config with no input to judge. */
export const PIPELINE_END_RUNS = [
  ...(['finite', 'continuous', 'invalid', 'unknown'] as const).map((status) => ({
    value: status as PipelineEndStatus,
    label: RUNS_COPY[status].label,
    icon: runsIcon(status),
  })),
  { value: 'none' as PipelineEndStatus, label: 'No input', icon: NoInputIcon },
];

/** A list row's "Runs" cell, with the canvas chip's explanation as its tooltip. */
export function PipelineRunsCell({ status }: { status: PipelineEndStatus }) {
  if (status === 'none') {
    return <span className="text-muted-foreground">—</span>;
  }
  const { label, tone } = RUNS_COPY[status];
  const copy = STATUS_COPY[status];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            className={cn('inline-flex cursor-default items-center gap-1.5 whitespace-nowrap text-body-sm', tone)}
            data-status={status}
            type="button"
          />
        }
      >
        <StopKindIcon className={cn('size-3.5', status === 'finite' && 'fill-current')} kind={STATUS_KIND[status]} />
        {label}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <span className="font-medium">{copy.label}.</span> {copy.detail}
      </TooltipContent>
    </Tooltip>
  );
}
