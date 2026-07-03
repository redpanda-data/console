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

import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronDown, MousePointerClick } from 'lucide-react';
import { useState } from 'react';

export type UnsavedNode = { id: string; label: string; detail?: string };

type PipelineUnsavedPanelProps = {
  nodes: UnsavedNode[];
  /** Jump to a node (select it + recenter the canvas). */
  onSelect: (nodeId: string) => void;
};

/**
 * Floating amber "unsaved" chip on the Visual canvas, mirroring the problems chip. Expands to a
 * list of the nodes whose config differs from the last-saved pipeline; clicking one jumps to it.
 */
export function PipelineUnsavedPanel({ nodes, onSelect }: PipelineUnsavedPanelProps) {
  const [open, setOpen] = useState(false);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1.5 font-medium text-muted-foreground text-xs shadow-sm backdrop-blur-sm transition-colors hover:bg-muted/50"
        data-testid="pipeline-unsaved-chip"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span aria-hidden className="size-2 rounded-full bg-unsaved" />
        {nodes.length === 1 ? '1 unsaved' : `${nodes.length} unsaved`}
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          className="flex max-h-72 w-72 flex-col overflow-y-auto rounded-md border border-border bg-background/95 p-1 shadow-md backdrop-blur-sm"
          data-testid="pipeline-unsaved-list"
        >
          {nodes.map((node) => (
            <button
              className="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
              key={node.id}
              onClick={() => {
                onSelect(node.id);
                setOpen(false);
              }}
              type="button"
            >
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-unsaved" />
              <Text as="span" className="min-w-0 truncate text-foreground text-xs" variant="bodySmall">
                {node.label}
              </Text>
              {node.detail ? (
                <span
                  className="min-w-0 max-w-[45%] shrink truncate text-[11px] text-muted-foreground"
                  title={node.detail}
                >
                  {node.detail}
                </span>
              ) : null}
              <MousePointerClick className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
