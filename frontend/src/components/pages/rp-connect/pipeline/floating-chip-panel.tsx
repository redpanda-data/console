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

import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * Popover-style dismissal for a floating chip's expanded list: close on outside click or Escape.
 * Returns the ref to attach to the chip's container.
 */
function useChipDismissal(open: boolean, setOpen: (next: boolean) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !containerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Claim the event: Escape dismisses only this topmost layer, not also the canvas
        // selection (whose window-level handler checks defaultPrevented / stopped events).
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpen]);
  return containerRef;
}

type FloatingChipPanelProps = {
  /** Leading indicator in the chip — a status dot or an icon. */
  leading: React.ReactNode;
  /** Chip text (e.g. "3 problems"). */
  label: React.ReactNode;
  /** Tone/color classes appended to the chip button (border/text/hover). */
  chipClassName?: string;
  chipTestId?: string;
  /** Width/extra classes for the expanded list container. */
  listClassName?: string;
  listTestId?: string;
  /** Expanded-list content; call `close` after acting on a row to collapse the panel. */
  children: (close: () => void) => React.ReactNode;
};

/**
 * A floating, bottom-anchored chip on the Visual canvas that expands to a scrollable list on click.
 * Owns open/close (outside-click + Escape dismissal); callers supply the chip's tone, label, and rows.
 */
export function FloatingChipPanel({
  leading,
  label,
  chipClassName,
  chipTestId,
  listClassName,
  listTestId,
  children,
}: FloatingChipPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useChipDismissal(open, setOpen);

  return (
    <div className="flex flex-col items-end gap-1.5" ref={containerRef}>
      <button
        aria-expanded={open}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded-md border bg-background/90 px-2.5 py-1.5 font-medium text-xs shadow-sm backdrop-blur-sm transition-colors',
          chipClassName
        )}
        data-testid={chipTestId}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {leading}
        {label}
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          className={cn(
            'flex max-h-72 flex-col overflow-y-auto rounded-md border border-border bg-background/95 p-1 shadow-md backdrop-blur-sm',
            listClassName
          )}
          data-testid={listTestId}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
