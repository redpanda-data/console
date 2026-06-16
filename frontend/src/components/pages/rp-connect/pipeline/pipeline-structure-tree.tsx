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
import { useMemo, useState } from 'react';

import { sectionAccent } from './pipeline-flow-canvas-nodes';
import { ConnectorLogo } from '../onboarding/connector-logo';
import { type PipelineFlowNode, parsePipelineFlowTree } from '../utils/pipeline-flow-parser';

const SECTION_TITLES: Record<string, string> = {
  input: 'INPUT',
  processor: 'PROCESSORS',
  output: 'OUTPUT',
  resource: 'RESOURCES',
};

// Indentation per nesting level, capped so even very deep pipelines never push rows
// off the side — past the cap the label simply truncates instead of overflowing.
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

// The nearest ancestor (including the node itself) that maps to an editable YAML
// location — what a click should reveal/select in the editor. Structural sub-nodes
// (switch cases) have no edit target of their own, so they resolve to their parent.
function editableAncestorId(node: PipelineFlowNode, maps: NodeMaps): string | undefined {
  let current: PipelineFlowNode | undefined = node;
  while (current && !current.editTarget) {
    current = current.parentId ? maps.byId.get(current.parentId) : undefined;
  }
  return current?.id;
}

type RowProps = {
  node: PipelineFlowNode;
  depth: number;
  maps: NodeMaps;
  collapsedIds: Set<string>;
  toggle: (id: string) => void;
  selectedId?: string;
  onSelect: (highlightId: string, editableId?: string) => void;
};

const NodeRow = ({ node, depth, maps, collapsedIds, toggle, selectedId, onSelect }: RowProps) => {
  const children = maps.childrenOf(node.id);
  const hasChildren = children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  const accent = sectionAccent(node.section);
  const selected = selectedId === node.id;

  return (
    <>
      <div className="flex items-stretch" style={{ paddingLeft: indentFor(depth) }}>
        {/* Toggle is a separate hit target so it doesn't also select the node. */}
        {hasChildren ? (
          <button
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            className="flex w-5 shrink-0 cursor-pointer items-center justify-center self-stretch rounded text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => toggle(node.id)}
            type="button"
          >
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ) : (
          <span aria-hidden className="w-5 shrink-0" />
        )}
        <button
          className={cn(
            'group flex min-w-0 flex-1 items-center gap-1.5 rounded-md border-transparent border-l-2 py-1 pr-2 pl-1.5 text-left text-sm transition-colors',
            selected ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/50'
          )}
          onClick={() => onSelect(node.id, editableAncestorId(node, maps))}
          style={selected && accent ? { borderLeftColor: accent } : undefined}
          title={node.label}
          type="button"
        >
          <ConnectorLogo className="size-4 shrink-0" fallback={Box} name={node.label as ComponentName} />
          <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
          {node.labelText ? (
            <span className="min-w-0 max-w-[40%] shrink truncate text-muted-foreground text-xs" title={node.labelText}>
              {node.labelText}
            </span>
          ) : null}
        </button>
      </div>
      {hasChildren && !collapsed
        ? children.map((child) => (
            <NodeRow
              collapsedIds={collapsedIds}
              depth={depth + 1}
              key={child.id}
              maps={maps}
              node={child}
              onSelect={onSelect}
              selectedId={selectedId}
              toggle={toggle}
            />
          ))
        : null}
    </>
  );
};

// Mirrors a node row's indent (+ toggle gutter) so the dashed "Add input/output"
// affordance lines up with the rows it stands in for.
const AddConnectorRow = ({ section, onAdd }: { section: string; onAdd: (section: string) => void }) => (
  <div className="flex items-stretch" style={{ paddingLeft: indentFor(0) }}>
    <span aria-hidden className="w-5 shrink-0" />
    <button
      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border border-dashed py-1 pr-2 pl-1.5 text-left text-muted-foreground text-sm transition-colors hover:border-primary/60 hover:bg-muted/40 hover:text-foreground"
      onClick={() => onAdd(section)}
      type="button"
    >
      <Plus className="size-3.5 shrink-0" />
      <span className="truncate">Add {section}</span>
    </button>
  </div>
);

type PipelineStructureTreeProps = {
  configYaml: string;
  /** Node id to highlight (e.g. the node under the YAML cursor). */
  selectedNodeId?: string;
  /** A row was clicked: `highlightId` is the clicked node; `editableId` is the
      nearest node with a YAML location (what the editor should reveal). */
  onSelectNode?: (highlightId: string, editableId?: string) => void;
  /** Edit mode only: add an input/output for an empty section (section name). */
  onAddConnector?: (section: string) => void;
};

/**
 * A compact, width-bounded structure overview of a pipeline — an indented outline of
 * its inputs, processors, branches, outputs, and resources. Unlike the full canvas it
 * intentionally shows only structure (icon + name), so deep nesting truncates rather
 * than overflowing the narrow side lane. Rows are clickable to drive the editor.
 */
export function PipelineStructureTree({
  configYaml,
  selectedNodeId,
  onSelectNode,
  onAddConnector,
}: PipelineStructureTreeProps) {
  const { nodes } = useMemo(() => parsePipelineFlowTree(configYaml), [configYaml]);
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
  const isEmptySection = (sectionId: string) => {
    const kids = maps.childrenOf(sectionId);
    return kids.length === 0 || kids.every((k) => k.label === 'none');
  };

  return (
    <div className="flex flex-col gap-3 py-3 pr-2" role="tree">
      {sections.map((section) => (
        <div className="flex flex-col" key={section.id}>
          <Text
            as="div"
            className="px-2 pb-1 text-muted-foreground uppercase tracking-wide"
            style={section.section ? { color: sectionAccent(section.section) } : undefined}
            variant="captionStrongMedium"
          >
            {SECTION_TITLES[section.section ?? ''] ?? section.label}
          </Text>
          {isEmptySection(section.id) ? (
            onAddConnector && (section.section === 'input' || section.section === 'output') ? (
              <AddConnectorRow onAdd={onAddConnector} section={section.section} />
            ) : (
              <span className="px-2 pl-9 text-muted-foreground/70 text-sm italic">empty</span>
            )
          ) : (
            maps
              .childrenOf(section.id)
              .filter((n) => n.label !== 'none')
              .map((node) => (
                <NodeRow
                  collapsedIds={collapsedIds}
                  depth={0}
                  key={node.id}
                  maps={maps}
                  node={node}
                  onSelect={(highlightId, editableId) => onSelectNode?.(highlightId, editableId)}
                  selectedId={selectedNodeId}
                  toggle={toggle}
                />
              ))
          )}
        </div>
      ))}
    </div>
  );
}
