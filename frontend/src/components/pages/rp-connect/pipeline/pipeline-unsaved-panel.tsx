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

import { MousePointerClick } from 'lucide-react';

import { FloatingChipPanel } from './floating-chip-panel';

type UnsavedNode = { id: string; label: string; detail?: string };

type PipelineUnsavedPanelProps = {
  nodes: UnsavedNode[];
  /** Jump to a node (select it + recenter the canvas). */
  onSelect: (nodeId: string) => void;
};

/**
 * Floating "unsaved" chip (warning-toned) on the Visual canvas, mirroring the problems chip. Expands to a
 * list of the nodes whose config differs from the last-saved pipeline; clicking one jumps to it.
 */
export function PipelineUnsavedPanel({ nodes, onSelect }: PipelineUnsavedPanelProps) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <FloatingChipPanel
      chipClassName="border-border text-muted-foreground hover:bg-muted/50"
      chipTestId="pipeline-unsaved-chip"
      label={nodes.length === 1 ? '1 unsaved' : `${nodes.length} unsaved`}
      leading={<span aria-hidden className="size-2 rounded-full bg-warning" />}
      listClassName="w-72"
      listTestId="pipeline-unsaved-list"
    >
      {(close) =>
        nodes.map((node) => (
          <button
            className="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
            key={node.id}
            onClick={() => {
              onSelect(node.id);
              close();
            }}
            type="button"
          >
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
            <span className="min-w-0 truncate text-body-sm text-foreground">{node.label}</span>
            {node.detail ? (
              <span
                className="min-w-0 max-w-[45%] shrink truncate text-body-sm text-muted-foreground"
                title={node.detail}
              >
                {node.detail}
              </span>
            ) : null}
            <MousePointerClick className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))
      }
    </FloatingChipPanel>
  );
}
