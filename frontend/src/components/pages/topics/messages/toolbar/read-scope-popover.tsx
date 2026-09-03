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

import { Button } from 'components/redpanda-ui/components/button';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  HashIcon,
  HistoryIcon,
  InfoIcon,
  RadioIcon,
  SkipBackIcon,
} from 'lucide-react';
import { useState } from 'react';

import { StartOffsetDateTimePicker } from '../../Tab.Messages/forms/start-offset-date-time-picker';
import { LIMIT_OPTIONS } from '../constants';
import type { ReadScopeMode } from '../types';

export const READ_SCOPE_META: Record<ReadScopeMode, { label: string; description: string; icon: typeof HistoryIcon }> =
  {
    newest: { label: 'Newest', description: 'The most recent messages', icon: HistoryIcon },
    oldest: { label: 'Oldest', description: 'From the beginning of the topic', icon: SkipBackIcon },
    offset: { label: 'Offset', description: 'Start from a specific offset', icon: HashIcon },
    timestamp: { label: 'Timestamp', description: 'Start from a point in time', icon: CalendarIcon },
  };

const SCOPE_MODES: ReadScopeMode[] = ['newest', 'oldest', 'offset', 'timestamp'];

/** Modes that support continuous (load-as-you-scroll) pagination. */
const supportsContinuous = (mode: ReadScopeMode) => mode === 'newest' || mode === 'oldest';

export type ReadScopePopoverProps = {
  topicName: string;
  mode: ReadScopeMode;
  onModeChange: (mode: ReadScopeMode) => void;
  customOffset: number;
  onCustomOffsetChange: (offset: number) => void;
  startTimestamp: number;
  onStartTimestampChange: (timestamp: number) => void;
  maxResults: number;
  onMaxResultsChange: (maxResults: number) => void;
  continuousMode: boolean;
  onContinuousModeChange: (enabled: boolean) => void;
  partitionId: number;
  onPartitionIdChange: (partitionId: number) => void;
  partitionCount: number;
  /** Live tail is a menu entry here ("or stream"); picking a start mode stops it. */
  liveTail: boolean;
  onLiveTailChange: (enabled: boolean) => void;
  onOpenDocs: () => void;
  /** Lets a caller (e.g. keyboard-nav gating) know when this popover is open. */
  onOpenChange?: (open: boolean) => void;
};

const ModeRow = ({ mode, selected, onSelect }: { mode: ReadScopeMode; selected: boolean; onSelect: () => void }) => {
  const meta = READ_SCOPE_META[mode];
  const Icon = meta.icon;
  return (
    <button
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent',
        selected && 'bg-accent/60'
      )}
      data-testid={`read-scope-mode-${mode}`}
      onClick={onSelect}
      type="button"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-sm">{meta.label}</span>
        <span className="mt-0.5 block text-muted-foreground text-xs leading-relaxed">{meta.description}</span>
      </span>
      {selected && <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />}
    </button>
  );
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: popover composes several independent controls
export const ReadScopePopover = ({
  topicName,
  mode,
  onModeChange,
  customOffset,
  onCustomOffsetChange,
  startTimestamp,
  onStartTimestampChange,
  maxResults,
  onMaxResultsChange,
  continuousMode,
  onContinuousModeChange,
  partitionId,
  onPartitionIdChange,
  partitionCount,
  liveTail,
  onLiveTailChange,
  onOpenDocs,
  onOpenChange,
}: ReadScopePopoverProps) => {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const meta = READ_SCOPE_META[mode];
  const Icon = liveTail ? RadioIcon : meta.icon;
  const continuousAvailable = supportsContinuous(mode) && !liveTail;
  const summary = (() => {
    if (liveTail) {
      return '· streaming';
    }
    return continuousMode && continuousAvailable ? `· ${maxResults}/page · continuous` : `· ${maxResults}`;
  })();

  const limitValues = LIMIT_OPTIONS.includes(maxResults)
    ? LIMIT_OPTIONS
    : [...LIMIT_OPTIONS, maxResults].sort((a, b) => a - b);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="h-10 gap-2 px-3.5"
            data-testid="read-scope-button"
            title="Read scope — where to start reading"
            variant="outline"
          >
            <Icon className={cn('size-4', liveTail ? 'text-green-600' : 'text-muted-foreground')} />
            <span className="font-semibold text-sm">{liveTail ? 'Live tail' : meta.label}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{summary}</span>
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[600px] p-0">
        <div className="flex items-stretch">
          <div className="min-w-0 flex-1 p-2">
            <div className="flex min-h-6 items-center justify-between gap-2 px-3 pt-1 pb-2">
              <span className="font-semibold text-[10.5px] text-muted-foreground uppercase tracking-wider">
                Start from
              </span>
              <Button
                data-testid="read-scope-docs-button"
                onClick={() => {
                  setOpen(false);
                  onOpenDocs();
                }}
                size="icon-xs"
                title="How reading works — open explainer"
                variant="ghost"
              >
                <InfoIcon />
              </Button>
            </div>
            {SCOPE_MODES.map((m) => (
              <ModeRow
                key={m}
                mode={m}
                onSelect={() => {
                  if (liveTail) {
                    onLiveTailChange(false);
                  }
                  onModeChange(m);
                }}
                selected={!liveTail && mode === m}
              />
            ))}
            <div className="my-1.5 flex items-center gap-2 px-2">
              <div className="h-px flex-1 bg-border" />
              <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                or stream
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <button
              className={cn(
                'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent',
                liveTail && 'bg-green-100 hover:bg-green-100 dark:bg-green-950 dark:hover:bg-green-950'
              )}
              data-testid="read-scope-mode-live"
              onClick={() => {
                onLiveTailChange(!liveTail);
                setOpen(false);
              }}
              type="button"
            >
              <RadioIcon className="mt-0.5 size-4 shrink-0 text-green-600" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm">Live tail</span>
                <span className="mt-0.5 block text-muted-foreground text-xs leading-relaxed">
                  Stream new messages as they arrive
                </span>
              </span>
              {liveTail && <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />}
            </button>
          </div>

          <div className="flex w-[290px] shrink-0 flex-col gap-3 border-l p-4">
            {mode === 'offset' && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] uppercase tracking-wide" htmlFor="read-scope-offset">
                  Start offset
                </Label>
                <Input
                  className="font-mono"
                  id="read-scope-offset"
                  inputMode="numeric"
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(parsed) && parsed >= 0) {
                      onCustomOffsetChange(parsed);
                    }
                  }}
                  placeholder="e.g. 48210"
                  testId="read-scope-offset-input"
                  value={customOffset >= 0 ? String(customOffset) : ''}
                />
                <span className="text-muted-foreground text-xs">First message at or after this offset</span>
              </div>
            )}
            {mode === 'timestamp' && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] uppercase tracking-wide">Start timestamp</Label>
                <StartOffsetDateTimePicker
                  inline
                  onChange={onStartTimestampChange}
                  topicName={topicName}
                  value={startTimestamp}
                />
                <span className="text-muted-foreground text-xs">First message at or after this time</span>
              </div>
            )}

            {/* Continuous pagination only exists for the newest/oldest scopes */}
            {continuousAvailable && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">Load continuously</div>
                  <div className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                    On: pages load as you scroll. Turn off to sort the table.
                  </div>
                </div>
                <Switch
                  checked={continuousMode}
                  onCheckedChange={onContinuousModeChange}
                  testId="read-scope-continuous-switch"
                />
              </div>
            )}

            <div className="mt-auto flex flex-col gap-1.5 border-t pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">
                    {continuousMode && continuousAvailable ? 'Page size' : 'Max results'}
                  </div>
                  <div className="mt-0.5 text-muted-foreground text-xs">
                    {continuousMode && continuousAvailable ? 'Rows fetched per scroll' : 'Rows fetched in one request'}
                  </div>
                </div>
                <ToggleGroup
                  disabled={liveTail}
                  onValueChange={(value: string[]) => {
                    if (value.length > 0) {
                      onMaxResultsChange(Number(value[0]));
                    }
                  }}
                  size="sm"
                  title={liveTail ? 'Stop live tail to change this' : undefined}
                  value={[String(maxResults)]}
                >
                  {limitValues.map((limit) => (
                    <ToggleGroupItem
                      className="font-mono text-xs"
                      key={limit}
                      testId={`read-scope-limit-${limit}`}
                      value={String(limit)}
                    >
                      {limit}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="font-semibold text-sm">Partition</div>
                <Select onValueChange={(value) => onPartitionIdChange(Number(value))} value={String(partitionId)}>
                  <SelectTrigger className="w-40" testId="read-scope-partition-select">
                    <SelectValue>
                      {(value: unknown) => (Number(value) === -1 ? 'All partitions' : `Partition ${value}`)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">All partitions</SelectItem>
                    {Array.from({ length: partitionCount }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        Partition {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
