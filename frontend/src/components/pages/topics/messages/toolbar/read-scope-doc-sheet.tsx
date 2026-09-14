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

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from 'components/redpanda-ui/components/sheet';
import { cn } from 'components/redpanda-ui/lib/utils';
import { RadioIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { READ_SCOPE_META } from './read-scope-popover';
import type { ReadScopeMode } from '../types';

type AxisMode = ReadScopeMode | 'live';

/** The illustrated partition: cells 0–4 already aged out, 5–14 retained, 15–17 future. */
const CELL_COUNT = 18;
const AGED_END = 5;
const RETAINED_END = 14;

const AXIS_CONFIGS: Record<
  AxisMode,
  {
    window: [number, number];
    anchor: number;
    direction: 'backward' | 'forward' | 'live';
    ghost?: number;
    anchorLabel: string;
    caption: string;
  }
> = {
  newest: {
    window: [11, 14],
    anchor: 14,
    direction: 'backward',
    anchorLabel: 'newest offset',
    caption: 'Latest results, reading backward from the newest offset.',
  },
  oldest: {
    window: [5, 8],
    anchor: 5,
    direction: 'forward',
    anchorLabel: 'low watermark',
    caption: 'From the earliest retained offset (low watermark), reading forward.',
  },
  offset: {
    window: [9, 12],
    anchor: 9,
    direction: 'forward',
    ghost: 2,
    anchorLabel: 'your offset',
    caption: 'Jumps to one exact offset. A hardcoded offset may have already aged out of retention.',
  },
  timestamp: {
    window: [8, 11],
    anchor: 8,
    direction: 'forward',
    anchorLabel: 'resolved offset',
    caption: 'Resolves a point in time to an offset, then reads forward.',
  },
  live: {
    window: [12, 14],
    anchor: 15,
    direction: 'live',
    anchorLabel: 'live edge',
    caption: 'Tails past the newest offset — new messages stream in as producers write them.',
  },
};

const MODE_DESCRIPTIONS: { mode: AxisMode; title: string; description: string }[] = [
  { mode: 'newest', title: 'Newest', description: 'The most recent messages' },
  { mode: 'oldest', title: 'Oldest', description: 'From the beginning of the topic' },
  { mode: 'offset', title: 'Offset', description: 'Start from a specific offset' },
  { mode: 'timestamp', title: 'Timestamp', description: 'Start from a point in time' },
  { mode: 'live', title: 'Live tail', description: 'Stream new messages as they arrive' },
];

const AGED_STRIPES = 'repeating-linear-gradient(45deg, var(--color-muted) 0 3px, transparent 3px 6px)';

const DIRECTION_ARROWS: Record<'backward' | 'forward' | 'live', string> = {
  backward: '←',
  forward: '→',
  live: '≫',
};

/** Illustrated partition axis: where the selected mode drops the reading needle. */
const MiniAxis = ({ mode }: { mode: AxisMode }) => {
  const cfg = AXIS_CONFIGS[mode];
  return (
    <div>
      <div className="flex gap-0.5">
        {Array.from({ length: CELL_COUNT }, (_, i) => {
          const aged = i < AGED_END;
          const future = i > RETAINED_END;
          const inWindow = i >= cfg.window[0] && i <= cfg.window[1] && !future;
          const isAnchor = i === cfg.anchor && !future;
          const isGhost = cfg.ghost === i;
          const liveInflow = mode === 'live' && future;
          return (
            <div
              className={cn(
                'h-[22px] min-w-0 flex-1 rounded-[3px] border-[1.5px] border-border bg-background transition-all',
                aged && 'opacity-70',
                future && 'border-dashed bg-transparent',
                inWindow && 'border-primary bg-primary/15',
                isAnchor && 'border-primary bg-primary',
                liveInflow && 'animate-pulse border-green-600 border-dashed bg-green-100 dark:bg-green-950',
                isGhost && 'border-destructive border-dashed bg-transparent'
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size illustration
              key={i}
              style={aged ? { backgroundImage: AGED_STRIPES } : undefined}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={cn('font-bold font-mono text-[10.5px]', mode === 'live' ? 'text-green-600' : 'text-primary')}>
          {DIRECTION_ARROWS[cfg.direction]} {cfg.anchorLabel}
        </span>
        <span className="flex items-center gap-2.5 text-[9px] text-muted-foreground uppercase tracking-wide">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block size-[9px] rounded-[2px] border-[1.5px] border-border"
              style={{ backgroundImage: AGED_STRIPES }}
            />
            aged
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-[9px] rounded-[2px] border-[1.5px] border-border bg-background" />
            retained
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-[9px] rounded-[2px] border-[1.5px] border-green-600 border-dashed" />
            future
          </span>
        </span>
      </div>
      <p className="mt-2 text-muted-foreground text-xs leading-relaxed">{cfg.caption}</p>
    </div>
  );
};

export const ReadScopeDocSheet = ({
  open,
  onOpenChange,
  mode = 'newest',
  liveTail = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The currently selected read scope — previewed when the sheet opens. */
  mode?: ReadScopeMode;
  liveTail?: boolean;
}) => {
  const [previewMode, setPreviewMode] = useState<AxisMode>(liveTail ? 'live' : mode);

  // Every open starts on the mode the user is actually reading with
  useEffect(() => {
    if (open) {
      setPreviewMode(liveTail ? 'live' : mode);
    }
  }, [open, mode, liveTail]);

  const previewTitle = MODE_DESCRIPTIONS.find((m) => m.mode === previewMode)?.title ?? '';

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-[400px] gap-3 px-5 py-5 sm:max-w-[400px]" side="right">
        <SheetHeader>
          <SheetTitle>How reading starts</SheetTitle>
          <SheetDescription>
            A partition is an append-only log. Each mode is a rule for <em>where to drop the needle</em>.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col overflow-y-auto pb-2">
          <div className="mb-2 font-semibold text-[10.5px] text-muted-foreground uppercase tracking-wider">
            Where {previewTitle} lands
          </div>
          <div className="rounded-md border bg-card px-3 pt-3 pb-3.5">
            <MiniAxis mode={previewMode} />
          </div>

          <div className="mt-4 mb-1 border-t pt-3 font-semibold text-[10.5px] text-muted-foreground uppercase tracking-wider">
            Every mode — tap to preview
          </div>
          {MODE_DESCRIPTIONS.map(({ mode: m, title, description }) => {
            const Icon = m === 'live' ? RadioIcon : READ_SCOPE_META[m].icon;
            return (
              <button
                className={cn(
                  '-mx-3 flex items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted',
                  previewMode === m && 'bg-muted'
                )}
                data-testid={`read-scope-doc-mode-${m}`}
                key={m}
                onClick={() => setPreviewMode(m)}
                type="button"
              >
                <Icon className={cn('mt-0.5 size-4 shrink-0', m === 'live' ? 'text-green-600' : 'text-primary')} />
                <span className="min-w-0">
                  <span className="block font-semibold text-[12.5px]">{title}</span>
                  <span className="mt-0.5 block text-muted-foreground text-xs leading-relaxed">{description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};
