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

import { jumpableNodes, searchKeywords, searchValue } from './pipeline-canvas-command-palette-utils';
import { sectionAccent } from './pipeline-flow-canvas-nodes';
import { type PipelineFlowNode, SECTION_LABEL } from '../utils/pipeline-flow-parser';

// A quick action in the palette (view in YAML, undo/redo, …); listed only when its handler prop was passed.
type PaletteAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
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

/**
 * The canvas command palette: fuzzy-search to jump to any node, plus global actions (view in YAML,
 * undo/redo). Opens on `/` because ⌘K is reserved by the app-shell search.
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

  const pick = (run: () => void) => {
    onOpenChange(false);
    run();
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
            {items.map((node, index) => (
              <CommandItem
                key={node.id}
                keywords={searchKeywords(node)}
                onSelect={() => pick(() => onJumpToNode(node))}
                value={searchValue(node, index)}
              >
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
