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
import { ElementTooltip } from 'components/misc/element-tooltip';
import { Button } from 'components/redpanda-ui/components/button';
import { cn } from 'components/redpanda-ui/lib/utils';
import { BookOpenIcon, Box, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';

import { InvalidConfigNotice } from './invalid-config-notice';
import { sectionAccent } from './pipeline-flow-canvas-nodes';
import { StopKindIcon } from './stop-condition';
import { useResilientParse } from './use-resilient-parse';
import { ConnectorLogo } from '../onboarding/connector-logo';
import { getNodeDocsUrl } from '../utils/connector-docs';
import { buildChildrenMap, hasStopSlot, type PipelineFlowNode } from '../utils/pipeline-flow-parser';
import { stopSummary } from '../utils/read-until';

const SECTION_TITLES: Record<string, string> = {
  input: 'INPUT',
  processor: 'PROCESSORS',
  output: 'OUTPUT',
  resource: 'RESOURCES',
};

const INDENT_STEP = 14;
const INDENT_BASE = 8;
const MAX_INDENT_DEPTH = 6;

function indentFor(depth: number) {
  return INDENT_BASE + Math.min(depth, MAX_INDENT_DEPTH) * INDENT_STEP;
}

type NodeMaps = {
  childrenOf: (id: string | undefined) => PipelineFlowNode[];
  byId: Map<string, PipelineFlowNode>;
};

function editableAncestorId(node: PipelineFlowNode, maps: NodeMaps) {
  let current: PipelineFlowNode | undefined = node;
  while (current && !current.editTarget) {
    current = current.parentId ? maps.byId.get(current.parentId) : undefined;
  }
  return current?.id;
}

function sectionRows(maps: NodeMaps, sectionId: string) {
  return maps.childrenOf(sectionId).filter((n) => n.label !== 'none');
}

function collectVisibleIds(maps: NodeMaps, collapsedIds: Set<string>) {
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

function stopRowSelectKeys(e: React.KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.stopPropagation();
  }
}

const RowStatusDot = ({ hasError, unsaved }: { hasError?: boolean; unsaved?: boolean }) => {
  if (hasError) {
    return (
      <ElementTooltip content="Has errors">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-destructive" />
      </ElementTooltip>
    );
  }
  if (unsaved) {
    return (
      <ElementTooltip content="Unsaved changes">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-informative" />
      </ElementTooltip>
    );
  }
  return null;
};

function useStopDescriptionId(node: PipelineFlowNode) {
  const id = useId();
  return hasStopSlot(node) ? id : undefined;
}

const StopMark = ({ node, descriptionId }: { node: PipelineFlowNode; descriptionId?: string }) => {
  if (!(descriptionId && node.stopSlot && node.endBehavior)) {
    return null;
  }
  const { kind } = node.endBehavior;
  const ends = kind === 'condition' || kind === 'natural';
  const { long } = stopSummary(node.stopSlot, node.endBehavior);
  return (
    <ElementTooltip content={long}>
      <span
        className={cn(
          'shrink-0',
          ends ? 'text-success' : 'text-muted-foreground',
          kind === 'invalid' && 'text-destructive'
        )}
      >
        <span className="sr-only" id={descriptionId}>
          {long}
        </span>
        <StopKindIcon className="size-3.5" filled={kind === 'condition'} kind={kind} />
      </span>
    </ElementTooltip>
  );
};

const NodeDocsLink = ({ label, href }: { label: string; href: string }) => (
  <span className="inline-flex shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 has-[:focus-visible]:opacity-100">
    <Button
      aria-label={`${label} documentation`}
      as="a"
      href={href}
      // WARNING: Stop docs-link clicks from reaching the tree row; opening documentation must not move the YAML cursor.
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onKeyDown={stopRowSelectKeys}
      rel="noopener noreferrer"
      size="icon-xs"
      target="_blank"
      variant="current-ghost"
    >
      <BookOpenIcon />
    </Button>
  </span>
);

type TreeKeyNav = { visibleIds: string[]; maps: NodeMaps; collapsedIds: Set<string> };

function keyboardFocusTarget(key: string, node: PipelineFlowNode, { visibleIds, maps, collapsedIds }: TreeKeyNav) {
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
      return maps.childrenOf(node.id).length > 0 && !collapsedIds.has(node.id) ? visibleIds[index + 1] : undefined;
    case 'ArrowLeft': {
      const parent = node.parentId ? maps.byId.get(node.parentId) : undefined;
      return parent && parent.kind !== 'section' ? parent.id : undefined;
    }
    default:
      return;
  }
}

type RowKeyIntent = { kind: 'select' } | { kind: 'toggle' } | { kind: 'focus'; id: string };

function rowKeyIntent(key: string, node: PipelineFlowNode, treeNav: TreeKeyNav): RowKeyIntent | undefined {
  if (key === 'Enter' || key === ' ') {
    return { kind: 'select' };
  }
  const hasChildren = treeNav.maps.childrenOf(node.id).length > 0;
  const collapsed = treeNav.collapsedIds.has(node.id);
  if ((key === 'ArrowRight' && hasChildren && collapsed) || (key === 'ArrowLeft' && hasChildren && !collapsed)) {
    return { kind: 'toggle' };
  }
  const target = keyboardFocusTarget(key, node, treeNav);
  return target ? { kind: 'focus', id: target } : undefined;
}

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
  posinset: number;
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
  const docsUrl = getNodeDocsUrl(node);
  const stopDescriptionId = useStopDescriptionId(node);

  return (
    <>
      <div
        aria-describedby={stopDescriptionId}
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
        <ElementTooltip content={node.label}>
          <span
            className={cn(
              'group flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 pl-1.5 text-left text-body transition-colors',
              selected ? 'font-medium text-foreground' : 'text-foreground hover:bg-muted/50'
            )}
            style={
              selected
                ? { backgroundColor: accent ? `color-mix(in srgb, ${accent} 16%, transparent)` : 'var(--color-muted)' }
                : undefined
            }
          >
            <ConnectorLogo className="size-4 shrink-0" fallback={Box} name={node.label as ComponentName} />
            <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
            {node.labelText ? (
              <ElementTooltip content={node.labelText}>
                <span className="max-w-[40%] min-w-0 shrink truncate text-body-sm text-muted-foreground">
                  {node.labelText}
                </span>
              </ElementTooltip>
            ) : null}
            <StopMark descriptionId={stopDescriptionId} node={node} />
            <RowStatusDot hasError={hasError} unsaved={unsaved} />
            {docsUrl ? <NodeDocsLink href={docsUrl} label={node.label} /> : null}
          </span>
        </ElementTooltip>
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

const AddConnectorRow = ({ section, onAdd }: { section: string; onAdd: (section: string) => void }) => (
  <div className="flex items-stretch" style={{ paddingLeft: indentFor(0) }}>
    <span aria-hidden className="w-5 shrink-0" />
    <button
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border py-1 pr-2 pl-1.5 text-left text-body text-muted-foreground transition-colors hover:border-primary/60 hover:bg-muted/40 hover:text-foreground"
      onClick={() => onAdd(section)}
      type="button"
    >
      <Plus className="size-3.5 shrink-0" />
      <span className="truncate">Add {section}</span>
    </button>
  </div>
);

function invalidOutlineNotice(showingStale: boolean, error?: string) {
  if (showingStale) {
    return 'Showing the last valid outline — the current YAML is invalid.';
  }
  return error ? 'The current YAML is invalid — fix it in the editor to see the outline.' : undefined;
}

type TreeRovingFocusOptions = {
  maps: NodeMaps;
  collapsedIds: Set<string>;
  toggle: (id: string) => void;
  onSelectNode?: (highlightId: string, editableId?: string) => void;
};

function useTreeRovingFocus({ maps, collapsedIds, toggle, onSelectNode }: TreeRovingFocusOptions) {
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
    const intent = rowKeyIntent(e.key, node, { visibleIds, maps, collapsedIds });
    if (!intent) {
      return;
    }
    e.preventDefault();
    if (intent.kind === 'select') {
      onSelectNode?.(node.id, editableAncestorId(node, maps));
    } else if (intent.kind === 'toggle') {
      toggle(node.id);
    } else {
      focusRow(intent.id);
    }
  };

  return { tabbableId, registerRow, onRowKeyDown: handleRowKeyDown, onRowFocus: setFocusedId } satisfies TreeNav;
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
 * Compact outline of a pipeline; shows only structure (icon + name) so deep nesting fits the narrow
 * lane, and rows drive the editor. ARIA tree (flattened): every row is a focusable `treeitem` with
 * aria-level/posinset/setsize; a roving tabindex + Arrow/Home/End/Enter/Space drive focus and selection.
 *
 * The treeitem owns keyboard focus, selection, and expansion. The separate pointer-only chevron must not select the row or appear as another accessibility target.
 */
export function PipelineStructureTree({
  configYaml,
  selectedNodeId,
  errorNodeIds,
  unsavedNodeIds,
  onSelectNode,
  onAddConnector,
}: PipelineStructureTreeProps) {
  const { nodes, error, showingStale } = useResilientParse(configYaml);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const maps = useMemo<NodeMaps>(() => {
    const childMap = buildChildrenMap(nodes);
    const byId = new Map<string, PipelineFlowNode>(nodes.map((node) => [node.id, node]));
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
  const isEmptySection = (sectionId: string) => sectionRows(maps, sectionId).length === 0;

  const nav = useTreeRovingFocus({ maps, collapsedIds, toggle, onSelectNode });
  const notice = invalidOutlineNotice(showingStale, error);

  return (
    // WARNING: Keep section headings and add actions outside the tree; the tree role may own only tree items and groups.
    <div className="flex flex-col gap-3 py-3 pr-2">
      {notice ? (
        <InvalidConfigNotice className="ml-2" variant="compact">
          {notice}
        </InvalidConfigNotice>
      ) : null}
      {sections.map((section) => {
        const title = SECTION_TITLES[section.section ?? ''] ?? section.label;
        return (
          <div className="flex flex-col" key={section.id}>
            <div
              className="px-2 pb-1 text-body-sm font-medium tracking-wide text-muted-foreground uppercase"
              style={section.section ? { color: sectionAccent(section.section) } : undefined}
            >
              {title}
            </div>
            {isEmptySection(section.id) ? (
              onAddConnector && (section.section === 'input' || section.section === 'output') ? (
                <AddConnectorRow onAdd={onAddConnector} section={section.section} />
              ) : (
                <span className="px-2 pl-9 text-body text-muted-foreground/70 italic">empty</span>
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
