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

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'components/redpanda-ui/components/command';
import { FileCode2, type LucideIcon, Redo2, Undo2 } from 'lucide-react';
import { useMemo } from 'react';

import { sectionAccent } from './pipeline-flow-canvas-nodes';
import type { PipelineFlowNode } from '../utils/pipeline-flow-parser';

// One quick action in the palette (view in YAML, undo/redo, …). Hidden entries (no handler) are
// filtered out so the palette only lists what's actually available right now.
type PaletteAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  run?: () => void;
  /** When false the action is shown but disabled (e.g. nothing to undo). */
  enabled?: boolean;
};

type CanvasCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every parsed flow node — the searchable "go to" list is derived from the selectable ones. */
  nodes: PipelineFlowNode[];
  /** Select + center a node on the canvas. */
  onJumpToNode: (node: PipelineFlowNode) => void;
  // Edit-mode actions; omit to hide (e.g. view mode passes none).
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** "View in YAML" for the current selection — only when something is selected. */
  onViewSelectedInYaml?: () => void;
};

const SECTION_LABEL: Record<NonNullable<PipelineFlowNode['section']>, string> = {
  input: 'Input',
  processor: 'Processor',
  output: 'Output',
  resource: 'Resource',
};

// A node is reachable from the palette when it maps to an editable target (its own config).
// Structural wrappers (bare switch cases, merge dots) carry no target and are skipped — their
// editable entry is listed instead.
function jumpableNodes(nodes: PipelineFlowNode[]): PipelineFlowNode[] {
  return nodes.filter((n) => n.editTarget && n.section);
}

// The free-text a node matches on: its connector name, user label, role, and meta values.
function searchValue(node: PipelineFlowNode): string {
  const meta = node.meta?.map((m) => m.value).join(' ') ?? '';
  // The id keeps cmdk values unique when two nodes share a name; it never shows in the UI.
  return [node.label, node.labelText, node.section, meta, node.id].filter(Boolean).join(' ');
}

/**
 * The canvas command palette (opened with `/`): fuzzy-search to jump to any node, plus the global
 * actions (view in YAML, undo/redo). Opens on `/` because ⌘K is reserved by the app-shell search.
 */
export function CanvasCommandPalette({
  open,
  onOpenChange,
  nodes,
  onJumpToNode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onViewSelectedInYaml,
}: CanvasCommandPaletteProps) {
  const items = useMemo(() => jumpableNodes(nodes), [nodes]);

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];
    if (onViewSelectedInYaml) {
      list.push({ id: 'view-yaml', label: 'View selection in YAML', icon: FileCode2, run: onViewSelectedInYaml });
    }
    if (onUndo) {
      list.push({ id: 'undo', label: 'Undo', icon: Undo2, run: onUndo, enabled: canUndo });
    }
    if (onRedo) {
      list.push({ id: 'redo', label: 'Redo', icon: Redo2, run: onRedo, enabled: canRedo });
    }
    return list;
  }, [onViewSelectedInYaml, onUndo, onRedo, canUndo, canRedo]);

  // Run an action / navigation, then close the palette.
  const pick = (run?: () => void) => {
    onOpenChange(false);
    run?.();
  };

  return (
    <CommandDialog
      description="Search nodes and actions"
      onOpenChange={onOpenChange}
      open={open}
      title="Pipeline command palette"
    >
      <CommandInput placeholder="Search nodes and actions…" />
      <CommandList>
        <CommandEmpty>No matching nodes or actions.</CommandEmpty>
        {actions.length > 0 ? (
          <CommandGroup heading="Actions">
            {actions.map((action) => (
              <CommandItem
                disabled={action.enabled === false}
                key={action.id}
                onSelect={() => pick(action.run)}
                value={`action ${action.label}`}
              >
                <action.icon className="text-muted-foreground" />
                <span>{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {items.length > 0 ? (
          <CommandGroup heading="Go to node">
            {items.map((node) => (
              <CommandItem key={node.id} onSelect={() => pick(() => onJumpToNode(node))} value={searchValue(node)}>
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: sectionAccent(node.section) ?? 'var(--color-muted-foreground)' }}
                />
                <span className="font-medium">{node.label}</span>
                {node.labelText ? (
                  <span className="truncate text-muted-foreground text-xs">{node.labelText}</span>
                ) : null}
                <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                  {node.section ? SECTION_LABEL[node.section] : ''}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
