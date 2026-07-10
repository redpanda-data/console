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
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { Box, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { InvalidConfigNotice } from './invalid-config-notice';
import { sectionAccent } from './pipeline-flow-canvas-nodes';
import { useResilientParse } from './use-resilient-parse';
import { ConnectorLogo } from '../onboarding/connector-logo';
import type { PipelineFlowNode } from '../utils/pipeline-flow-parser';

const SECTION_TITLES: Record<string, string> = {
  input: 'INPUT',
  processor: 'PROCESSORS',
  output: 'OUTPUT',
  resource: 'RESOURCES',
};

// Per-level indent, capped so deep pipelines truncate instead of pushing rows off the side.
const INDENT_STEP = 14;
const INDENT_BASE = 8;
const MAX_INDENT_DEPTH = 6;

function indentFor(depth: number): number {
  return INDENT_BASE + Math.min(depth, MAX_INDENT_DEPTH) * INDENT_STEP;
}

type NodeMaps = {
  childrenOf: (id: string | undefined) => PipelineFlowNode[];
  byId: Map<string, PipelineFlowNode>;
};

// Nearest ancestor (or the node itself) with an editable YAML location — what a click reveals.
// Structural sub-nodes (switch cases) have no edit target, so they resolve to their parent.
function editableAncestorId(node: PipelineFlowNode, maps: NodeMaps): string | undefined {
  let current: PipelineFlowNode | undefined = node;
  while (current && !current.editTarget) {
    current = current.parentId ? maps.byId.get(current.parentId) : undefined;
  }
  return current?.id;
}

// Top-level rows shown for a section (its `none` placeholders read as "empty").
function sectionRows(maps: NodeMaps, sectionId: string): PipelineFlowNode[] {
  return maps.childrenOf(sectionId).filter((n) => n.label !== 'none');
}

// Visible rows in document order (respecting collapsed groups) for roving-tabindex navigation.
function collectVisibleIds(maps: NodeMaps, collapsedIds: Set<string>): string[] {
  const ids: string[] = [];
  const visit = (node: PipelineFlowNode) => {
    ids.push(node.id);
    if (!collapsedIds.has(node.id)) {
      for (const child of maps.childrenOf(node.id)) {
        visit(child);
      }
    }
  };
  for (const section of maps.childrenOf(undefined).filter((n) => n.kind === 'section')) {
    for (const row of sectionRows(maps, section.id)) {
      visit(row);
    }
  }
  return ids;
}

type TreeKeyNav = { visibleIds: string[]; maps: NodeMaps; collapsedIds: Set<string> };

// Which visible row (if any) a navigation key moves focus to. Expansion-state changes (ArrowRight
// on a collapsed group, ArrowLeft on an expanded one) are handled before this is consulted.
function keyboardFocusTarget(
  key: string,
  node: PipelineFlowNode,
  { visibleIds, maps, collapsedIds }: TreeKeyNav
): string | undefined {
  const index = visibleIds.indexOf(node.id);
  switch (key) {
    case 'ArrowDown':
      return visibleIds[index + 1];
    case 'ArrowUp':
      return visibleIds[index - 1];
    case 'Home':
      return visibleIds[0];
    case 'End':
      return visibleIds.at(-1);
    case 'ArrowRight':
      // Expanded group: move into its first child (the next row in document order).
      return maps.childrenOf(node.id).length > 0 && !collapsedIds.has(node.id) ? visibleIds[index + 1] : undefined;
    case 'ArrowLeft': {
      // Leaf or collapsed group: move to the parent row, unless the parent is a section header.
      const parent = node.parentId ? maps.byId.get(node.parentId) : undefined;
      return parent && parent.kind !== 'section' ? parent.id : undefined;
    }
    default:
      return;
  }
}

// Roving-focus wiring shared by every row.
type TreeNav = {
  tabbableId: string | undefined;
  registerRow: (id: string, el: HTMLDivElement | null) => void;
  onRowKeyDown: (e: React.KeyboardEvent, node: PipelineFlowNode) => void;
  onRowFocus: (id: string) => void;
};

type RowProps = {
  node: PipelineFlowNode;
  depth: number;
  maps: NodeMaps;
  collapsedIds: Set<string>;
  toggle: (id: string) => void;
  selectedId?: string;
  errorNodeIds?: ReadonlySet<string>;
  unsavedNodeIds?: ReadonlySet<string>;
  onSelect: (highlightId: string, editableId?: string) => void;
  nav: TreeNav;
  /** 1-based position among the row's rendered siblings (for aria-posinset). */
  posinset: number;
  /** Number of rendered siblings at this level (for aria-setsize). */
  setsize: number;
};

const NodeRow = ({
  node,
  depth,
  maps,
  collapsedIds,
  toggle,
  selectedId,
  errorNodeIds,
  unsavedNodeIds,
  onSelect,
  nav,
  posinset,
  setsize,
}: RowProps) => {
  const children = maps.childrenOf(node.id);
  const hasChildren = children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  const accent = sectionAccent(node.section);
  const selected = selectedId === node.id;
  const hasError = errorNodeIds?.has(node.id);
  const unsaved = unsavedNodeIds?.has(node.id);

  return (
    <>
      {/* The row itself is the treeitem: it takes focus and handles select/expand keys; the
          chevron stays a presentational click target so mouse behaviour is unchanged. */}
      <div
        aria-expanded={hasChildren ? !collapsed : undefined}
        aria-label={node.label}
        aria-level={depth + 1}
        aria-posinset={posinset}
        aria-selected={selected}
        aria-setsize={setsize}
        className="flex items-stretch rounded-md"
        onClick={() => onSelect(node.id, editableAncestorId(node, maps))}
        onFocus={() => nav.onRowFocus(node.id)}
        onKeyDown={(e) => nav.onRowKeyDown(e, node)}
        ref={(el) => nav.registerRow(node.id, el)}
        role="treeitem"
        style={{ paddingLeft: indentFor(depth) }}
        tabIndex={nav.tabbableId === node.id ? 0 : -1}
      >
        {/* Toggle is a separate hit target so it doesn't also select the node; the row owns the
            keyboard/ARIA expansion semantics, so it's hidden from the accessibility tree. */}
        {hasChildren ? (
          <button
            aria-hidden
            className="flex w-5 shrink-0 cursor-pointer items-center justify-center self-stretch rounded text-muted-foreground transition-colors hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            tabIndex={-1}
            type="button"
          >
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ) : (
          <span aria-hidden className="w-5 shrink-0" />
        )}
        <span
          className={cn(
            'group flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 pl-1.5 text-left text-sm transition-colors',
            selected ? 'font-medium text-foreground' : 'text-foreground hover:bg-muted/50'
          )}
          // Selected row gets a faint wash of its role colour instead of a left accent border.
          style={
            selected
              ? { backgroundColor: accent ? `color-mix(in srgb, ${accent} 16%, transparent)` : 'var(--color-muted)' }
              : undefined
          }
          title={node.label}
        >
          <ConnectorLogo className="size-4 shrink-0" fallback={Box} name={node.label as ComponentName} />
          <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
          {node.labelText ? (
            <span className="min-w-0 max-w-[40%] shrink truncate text-muted-foreground text-xs" title={node.labelText}>
              {node.labelText}
            </span>
          ) : null}
          {/* Error takes precedence over the unsaved dot, so a node never shows both. */}
          {hasError ? (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-destructive" title="Has errors" />
          ) : null}
          {unsaved && !hasError ? (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" title="Unsaved changes" />
          ) : null}
        </span>
      </div>
      {hasChildren && !collapsed
        ? children.map((child, index) => (
            <NodeRow
              collapsedIds={collapsedIds}
              depth={depth + 1}
              errorNodeIds={errorNodeIds}
              key={child.id}
              maps={maps}
              nav={nav}
              node={child}
              onSelect={onSelect}
              posinset={index + 1}
              selectedId={selectedId}
              setsize={children.length}
              toggle={toggle}
              unsavedNodeIds={unsavedNodeIds}
            />
          ))
        : null}
    </>
  );
};

// Mirrors a node row's indent + toggle gutter so the dashed "Add" affordance lines up.
const AddConnectorRow = ({ section, onAdd }: { section: string; onAdd: (section: string) => void }) => (
  <div className="flex items-stretch" style={{ paddingLeft: indentFor(0) }}>
    <span aria-hidden className="w-5 shrink-0" />
    <button
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border border-border border-dashed py-1 pr-2 pl-1.5 text-left text-muted-foreground text-sm transition-colors hover:border-primary/60 hover:bg-muted/40 hover:text-foreground"
      onClick={() => onAdd(section)}
      type="button"
    >
      <Plus className="size-3.5 shrink-0" />
      <span className="truncate">Add {section}</span>
    </button>
  </div>
);

// Notice atop the outline: holding a last-valid outline, vs. can't build one at all yet.
function invalidOutlineNotice(showingStale: boolean, error?: string): string | undefined {
  if (showingStale) {
    return 'Showing the last valid outline — the current YAML is invalid.';
  }
  if (error) {
    return 'The current YAML is invalid — fix it in the editor to see the outline.';
  }
  return;
}

type PipelineStructureTreeProps = {
  configYaml: string;
  /** Node id to highlight (e.g. the node under the YAML cursor). */
  selectedNodeId?: string;
  /** Node ids with lint errors — marked with a red dot. */
  errorNodeIds?: ReadonlySet<string>;
  /** Node ids whose config differs from the last-saved pipeline — marked with an amber dot. */
  unsavedNodeIds?: ReadonlySet<string>;
  /** Row clicked: `highlightId` is the clicked node; `editableId` is the nearest node to reveal. */
  onSelectNode?: (highlightId: string, editableId?: string) => void;
  /** Edit mode only: add an input/output for an empty section (section name). */
  onAddConnector?: (section: string) => void;
};

/**
 * Compact, width-bounded outline of a pipeline (inputs, processors, branches, outputs, resources).
 * Shows only structure (icon + name) so deep nesting truncates in the narrow lane; rows drive the editor.
 *
 * ARIA tree pattern (flattened): every row is a focusable `treeitem` with aria-level/posinset/
 * setsize; a roving tabindex plus Arrow/Home/End/Enter/Space keys drive focus, expansion and
 * selection.
 */
export function PipelineStructureTree({
  configYaml,
  selectedNodeId,
  errorNodeIds,
  unsavedNodeIds,
  onSelectNode,
  onAddConnector,
}: PipelineStructureTreeProps) {
  // Hold the last valid outline so the lane doesn't blank out mid-edit (see useResilientParse).
  const { nodes, error, showingStale } = useResilientParse(configYaml);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const maps = useMemo<NodeMaps>(() => {
    const childMap = new Map<string | undefined, PipelineFlowNode[]>();
    const byId = new Map<string, PipelineFlowNode>();
    for (const node of nodes) {
      byId.set(node.id, node);
      const siblings = childMap.get(node.parentId);
      if (siblings) {
        siblings.push(node);
      } else {
        childMap.set(node.parentId, [node]);
      }
    }
    return { childrenOf: (id) => childMap.get(id) ?? [], byId };
  }, [nodes]);

  const toggle = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const sections = maps.childrenOf(undefined).filter((n) => n.kind === 'section');
  // Sections with no real component (only a `none` placeholder) read as "empty".
  const isEmptySection = (sectionId: string) => sectionRows(maps, sectionId).length === 0;

  // Roving tabindex: exactly one row is tabbable; arrow keys move focus between visible rows.
  const visibleIds = useMemo(() => collectVisibleIds(maps, collapsedIds), [maps, collapsedIds]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const registerRow = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      rowRefs.current.set(id, el);
    } else {
      rowRefs.current.delete(id);
    }
  }, []);
  const focusRow = useCallback((id: string) => {
    setFocusedId(id);
    rowRefs.current.get(id)?.focus();
  }, []);
  const tabbableId = focusedId && visibleIds.includes(focusedId) ? focusedId : visibleIds[0];

  const handleRowKeyDown = (e: React.KeyboardEvent, node: PipelineFlowNode) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectNode?.(node.id, editableAncestorId(node, maps));
      return;
    }
    const hasChildren = maps.childrenOf(node.id).length > 0;
    const collapsed = collapsedIds.has(node.id);
    if ((e.key === 'ArrowRight' && hasChildren && collapsed) || (e.key === 'ArrowLeft' && hasChildren && !collapsed)) {
      e.preventDefault();
      toggle(node.id);
      return;
    }
    const target = keyboardFocusTarget(e.key, node, { visibleIds, maps, collapsedIds });
    if (target) {
      e.preventDefault();
      focusRow(target);
    }
  };

  const nav: TreeNav = { tabbableId, registerRow, onRowKeyDown: handleRowKeyDown, onRowFocus: setFocusedId };
  const notice = invalidOutlineNotice(showingStale, error);

  return (
    // Each non-empty section is its OWN labelled tree so role="tree" owns only treeitems —
    // the visible headers, "empty" notes and Add buttons live between the trees, not inside
    // one (a tree may own only treeitem/group children). Arrow keys still walk across sections.
    <div className="flex flex-col gap-3 py-3 pr-2">
      {/* Only a left margin: the container's `pr-2` supplies the matching right gap, so the banner
          sits symmetrically instead of leaving extra room on the right. */}
      {notice ? <InvalidConfigNotice className="ml-2 px-2.5 py-2 text-xs">{notice}</InvalidConfigNotice> : null}
      {sections.map((section) => {
        const title = SECTION_TITLES[section.section ?? ''] ?? section.label;
        return (
          <div className="flex flex-col" key={section.id}>
            <Text
              as="div"
              className="px-2 pb-1 text-muted-foreground uppercase tracking-wide"
              style={section.section ? { color: sectionAccent(section.section) } : undefined}
              variant="captionStrongMedium"
            >
              {title}
            </Text>
            {isEmptySection(section.id) ? (
              onAddConnector && (section.section === 'input' || section.section === 'output') ? (
                <AddConnectorRow onAdd={onAddConnector} section={section.section} />
              ) : (
                <span className="px-2 pl-9 text-muted-foreground/70 text-sm italic">empty</span>
              )
            ) : (
              <div aria-label={title} className="flex flex-col" role="tree">
                {sectionRows(maps, section.id).map((node, index, rows) => (
                  <NodeRow
                    collapsedIds={collapsedIds}
                    depth={0}
                    errorNodeIds={errorNodeIds}
                    key={node.id}
                    maps={maps}
                    nav={nav}
                    node={node}
                    onSelect={(highlightId, editableId) => onSelectNode?.(highlightId, editableId)}
                    posinset={index + 1}
                    selectedId={selectedNodeId}
                    setsize={rows.length}
                    toggle={toggle}
                    unsavedNodeIds={unsavedNodeIds}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
