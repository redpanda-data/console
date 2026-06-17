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
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FlowCardData } from './pipeline-flow-canvas-nodes';
import { flowEdgeTypes, flowNodeTypes, sectionAccent } from './pipeline-flow-canvas-nodes';
import { PipelineFlowSkeleton } from './pipeline-flow-nodes';
import {
  computeFlowLayout,
  type FlowInsertPayload,
  type FlowOrientation,
  parsePipelineFlowTree,
} from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const PARSE_DEBOUNCE_MS = 300;
// How far past the diagram the canvas may be panned, so a node near the edge can be
// brought to the middle to inspect it comfortably.
const PAN_PADDING = 240;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.25;

// Bounding box of the diagram's top-level nodes (children sit inside their parents, so
// the top-level boxes cover everything; resource cards can sit at negative x, so we
// measure rather than assume the content starts at the origin).
function contentBounds(nodes: Node[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let seen = false;
  for (const node of nodes) {
    if (node.parentId) {
      continue;
    }
    const w = (node.initialWidth ?? node.width ?? 0) as number;
    const h = (node.initialHeight ?? node.height ?? 0) as number;
    const right = node.position.x + w;
    const bottom = node.position.y + h;
    if (seen) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    } else {
      minX = node.position.x;
      minY = node.position.y;
      maxX = right;
      maxY = bottom;
      seen = true;
    }
  }
  return { minX, minY, maxX, maxY };
}
// The minimap always shows in the full editor (it's hidden only in the compact
// side-lane). It draws the content at a fixed scale, tight to the diagram.
const MINIMAP_WIDTH = 132;
const MINIMAP_HEIGHT = 84;
const MINIMAP_PAD = 6;
// The frame's 1px border (border-box) shrinks the svg's drawing area on each side.
const MINIMAP_BORDER = 1;

// Tint each minimap blip with its node's role accent; structural marks (section
// labels) drop out so only the actual components show — a simple, uncluttered overview.
function miniMapNodeColor(node: Node): string {
  return sectionAccent((node.data as FlowCardData | undefined)?.section) ?? 'transparent';
}

/**
 * A compact overview minimap. Unlike React Flow's built-in `MiniMap` (whose bounds
 * grow to include the live viewport, so they bloat when you pan into the surrounding
 * padding), this draws the **content** at a fixed scale and shows the viewport as a
 * rectangle clipped to the frame. So the canvas can be panned generously past the
 * nodes while the minimap stays tight to the diagram. Click/drag re-centres the view.
 */
function PipelineMiniMap({ nodes }: { nodes: Node[] }) {
  const transform = useStore((s) => s.transform);
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);
  const { setCenter } = useReactFlow();
  const draggingRef = useRef(false);

  // The svg fills the frame's content box — i.e. the frame minus its 1px border on
  // each side — so nothing the svg draws is clipped by the border.
  const mapW = MINIMAP_WIDTH - 2 * MINIMAP_BORDER;
  const mapH = MINIMAP_HEIGHT - 2 * MINIMAP_BORDER;

  const bounds = useMemo(() => contentBounds(nodes), [nodes]);
  const contentW = Math.max(bounds.maxX - bounds.minX, 1);
  const contentH = Math.max(bounds.maxY - bounds.minY, 1);
  const innerW = mapW - 2 * MINIMAP_PAD;
  const innerH = mapH - 2 * MINIMAP_PAD;
  const scale = Math.min(innerW / contentW, innerH / contentH);
  // Centre the content within the frame.
  const offsetX = MINIMAP_PAD + (innerW - contentW * scale) / 2 - bounds.minX * scale;
  const offsetY = MINIMAP_PAD + (innerH - contentH * scale) / 2 - bounds.minY * scale;

  const [tx, ty, zoom] = transform;
  // The viewport in minimap coordinates, clamped to the drawing area (with a 1px inset
  // for the stroke) so its border is always fully visible even when the view extends
  // past the content into the surrounding pan padding.
  const inset = 1;
  const left = Math.max((-tx / zoom) * scale + offsetX, inset);
  const top = Math.max((-ty / zoom) * scale + offsetY, inset);
  const right = Math.min((-tx / zoom + paneWidth / zoom) * scale + offsetX, mapW - inset);
  const bottom = Math.min((-ty / zoom + paneHeight / zoom) * scale + offsetY, mapH - inset);
  const view = { x: left, y: top, w: Math.max(right - left, 0), h: Math.max(bottom - top, 0) };

  const panToEvent = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left - offsetX) / scale;
    const fy = (e.clientY - rect.top - offsetY) / scale;
    setCenter(fx, fy, { zoom, duration: 0 });
  };

  return (
    <div
      className="nodrag nopan absolute z-10 overflow-hidden rounded-md border border-border bg-card shadow-sm"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT, right: 52, bottom: 12 }}
    >
      <svg
        className="block cursor-pointer"
        height={mapH}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          panToEvent(e);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) {
            panToEvent(e);
          }
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        role="presentation"
        width={mapW}
      >
        {nodes.map((node) => {
          const color = miniMapNodeColor(node);
          if (node.parentId || color === 'transparent') {
            return null;
          }
          const w = ((node.initialWidth ?? node.width ?? 0) as number) * scale;
          const h = ((node.initialHeight ?? node.height ?? 0) as number) * scale;
          return (
            <rect
              height={Math.max(h, 2)}
              key={node.id}
              rx={1.5}
              style={{ fill: color, opacity: 0.85 }}
              width={Math.max(w, 2)}
              x={node.position.x * scale + offsetX}
              y={node.position.y * scale + offsetY}
            />
          );
        })}
        <rect
          fill="color-mix(in srgb, var(--color-primary) 12%, transparent)"
          height={view.h}
          rx={2}
          stroke="var(--color-primary)"
          strokeWidth={1.5}
          width={view.w}
          x={view.x}
          y={view.y}
        />
      </svg>
    </div>
  );
}

type CanvasCallbacks = {
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  onSlotInsert?: (payload: FlowInsertPayload) => void;
  collapsedIds: ReadonlySet<string>;
  toggleCollapse: (nodeId: string) => void;
  selectedNodeId?: string;
  lintErrorsByNode?: Map<string, string[]>;
  flashNodeIds?: ReadonlySet<string>;
  flashToken?: number;
  /** Node ids present on the previous render — anything new is "appearing". */
  previousIds: ReadonlySet<string>;
};

// Wire interactivity into a layout node's data: collapse toggle, selection
// highlight, and the add-connector / redpanda setup-hint handlers. Editing now
// happens in the inspector rail (selection), not via a per-node button.
export function injectNodeData(node: Node, cb: CanvasCallbacks): Node {
  const data = { ...node.data } as FlowCardData;
  if (data.collapsible) {
    data.collapsed = cb.collapsedIds.has(node.id);
    data.onToggle = () => cb.toggleCollapse(node.id);
  }
  if (cb.selectedNodeId && node.id === cb.selectedNodeId) {
    data.selected = true;
  }
  const lintErrors = cb.lintErrorsByNode?.get(node.id);
  if (lintErrors?.length) {
    data.lintErrors = lintErrors;
  }
  if (cb.flashNodeIds?.has(node.id)) {
    data.flash = true;
    data.flashToken = cb.flashToken;
  }
  if (data.label === 'none' && cb.onAddConnector) {
    data.onAddConnector = cb.onAddConnector;
  }
  if (data.missingTopic && cb.onAddTopic) {
    data.onAddTopic = cb.onAddTopic;
  }
  if (data.missingSasl && cb.onAddSasl) {
    data.onAddSasl = cb.onAddSasl;
  }
  if (node.type === 'flowInsert' && cb.onSlotInsert) {
    (data as { onInsert?: (payload: FlowInsertPayload) => void }).onInsert = cb.onSlotInsert;
  }
  // A node that wasn't here last render (e.g. a child revealed by expanding its
  // container) should appear in place — not slide in from the canvas origin. Drop
  // the transform transition so it snaps to its spot, and let the card itself fade
  // + grow in (see `appeared`), so it reads as emerging from the expanded section.
  if (!cb.previousIds.has(node.id)) {
    data.appeared = true;
    return {
      ...node,
      data,
      style: { ...(node.style as Record<string, unknown>), transition: undefined },
    };
  }
  return { ...node, data };
}

type LegendFlags = { copyMerge: boolean; error: boolean; reference: boolean };

// A line swatch matching the edge styles drawn on the canvas.
function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      className="inline-block h-0 w-5 shrink-0 align-middle"
      style={{ borderTopColor: color, borderTopWidth: 2, borderTopStyle: dashed ? 'dashed' : 'solid' }}
    />
  );
}

// Explains the edge vocabulary (flow / copy-merge / error / resource use). Only the
// kinds present in the current diagram are listed.
function FlowLegend({ flags }: { flags: LegendFlags }) {
  if (!(flags.copyMerge || flags.error || flags.reference)) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-md border border-border bg-background/90 px-3 py-2 text-muted-foreground text-xs shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <LegendSwatch color="var(--color-primary)" />
        Data flow
      </div>
      {flags.copyMerge ? (
        <div className="flex items-center gap-2">
          <LegendSwatch color="var(--color-primary)" dashed />
          Copy / merge (branch)
        </div>
      ) : null}
      {flags.error ? (
        <div className="flex items-center gap-2">
          <LegendSwatch color="var(--color-destructive)" dashed />
          Error / dead-letter
        </div>
      ) : null}
      {flags.reference ? (
        <div className="flex items-center gap-2">
          <LegendSwatch color="var(--color-muted-foreground)" dashed />
          Uses resource
        </div>
      ) : null}
    </div>
  );
}

type DecorateEdgeOptions = {
  /** The selected node and all of its descendants (a container's whole subtree). */
  selectedScope?: ReadonlySet<string>;
  /** The hovered node and its descendants. */
  hoveredScope?: ReadonlySet<string>;
  onInsert?: (processorIndex: number) => void;
};

/**
 * Per-render edge decoration ("cable management"):
 * - resource-reference edges are always present but faint, rendering full-strength
 *   when one of their endpoints is selected or hovered (hover a cache to see its
 *   resource; select a resource to see everyone using it);
 * - while a node is selected, its edges — including everything inside a selected
 *   container — render full-strength and unrelated edges fade, so the selected
 *   node's complete wiring stands out in a dense graph;
 * - spine edges get their insert (+) handler.
 */
// Highlighted edges render in `primary`; recolour the arrowhead to match
// (error edges keep their red markers — those semantics win over the highlight).
function withHighlightMarker(edge: Edge): Edge {
  const tone = (edge.data as { tone?: string } | undefined)?.tone;
  if (tone === 'error' || typeof edge.markerEnd !== 'object' || !edge.markerEnd) {
    return edge;
  }
  return { ...edge, markerEnd: { ...edge.markerEnd, color: 'var(--color-primary)' } };
}

// Reference edges are context lines (dashed, muted), so they never fully dim —
// even when an unrelated node is selected they stay at the readable "faint" tier
// (muted but visible). An active endpoint highlights them; otherwise faint.
function decorateReferenceEdge(edge: Edge, activeScope: ReadonlySet<string> | undefined): Edge {
  const touchesActive = activeScope !== undefined && (activeScope.has(edge.source) || activeScope.has(edge.target));
  const next = { ...edge, data: { ...edge.data, emphasized: touchesActive, faint: !touchesActive } };
  return touchesActive ? withHighlightMarker(next) : next;
}

export function decorateEdges(edges: Edge[], { selectedScope, hoveredScope, onInsert }: DecorateEdgeOptions): Edge[] {
  const activeScope = selectedScope ?? hoveredScope;
  return edges.map((edge) => {
    let next = edge;
    if (onInsert && next.type === 'flowSpine') {
      next = {
        ...next,
        data: {
          ...next.data,
          onInsert: () => onInsert((next.data as { insertIndex?: number })?.insertIndex ?? 0),
        },
      };
    }
    if (next.id.startsWith('ref-')) {
      return decorateReferenceEdge(next, activeScope);
    }
    if (selectedScope !== undefined) {
      const touchesSelection = selectedScope.has(next.source) || selectedScope.has(next.target);
      next = { ...next, data: { ...next.data, dimmed: !touchesSelection, emphasized: touchesSelection } };
      return touchesSelection ? withHighlightMarker(next) : next;
    }
    return next;
  });
}

/**
 * Resolve what a click on `node` selects: the node itself if it's editable, else
 * its nearest selectable ancestor. Structural sub-nodes (switch cases, workflow
 * stages) have no `editTarget`, so clicking one selects the parent switch/workflow.
 */
export function selectionTargetForNode(node: Node, nodes: Node[]): { id: string; target: EditTarget } | null {
  let current: Node | undefined = node;
  while (current && !(current.data as FlowCardData).editTarget) {
    current = current.parentId ? nodes.find((n) => n.id === current?.parentId) : undefined;
  }
  const target = current && (current.data as FlowCardData).editTarget;
  return current && target ? { id: current.id, target } : null;
}

type PipelineFlowCanvasProps = {
  configYaml: string;
  /** Main-axis direction: 'horizontal' for the Visual lane, 'vertical' for the compact sidebar. */
  orientation?: FlowOrientation;
  /** Hide the zoom controls (used by the compact sidebar). */
  hideControls?: boolean;
  /** Static overview: no background dots, no pan/zoom — just a fit-to-view diagram (sidebar). */
  simple?: boolean;
  /** Currently selected node id (highlighted on the canvas). */
  selectedNodeId?: string;
  /** Lint messages mapped to node ids — badged in place on the canvas. */
  lintErrorsByNode?: Map<string, string[]>;
  /** Node ids to briefly pulse (e.g. after undo/redo), with a token to replay it. */
  flashNodeIds?: ReadonlySet<string>;
  flashToken?: number;
  /** Select a node by id + its edit target (clicking a node). */
  onSelectNode?: (nodeId: string, target: EditTarget) => void;
  /** Clear the selection (clicking empty canvas). */
  onClearSelection?: () => void;
  // Edit-mode callbacks. When omitted the canvas is a read-only viewer.
  onInsert?: (processorIndex: number) => void;
  onSlotInsert?: (payload: FlowInsertPayload) => void;
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
};

export function PipelineFlowCanvas({
  configYaml,
  orientation = 'horizontal',
  hideControls,
  simple,
  selectedNodeId,
  lintErrorsByNode,
  flashNodeIds,
  flashToken,
  onSelectNode,
  onClearSelection,
  onInsert,
  onSlotInsert,
  onAddConnector,
  onAddTopic,
  onAddSasl,
}: PipelineFlowCanvasProps) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  // Hovering a node lights up its (otherwise faint) resource-reference edges.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();
  // Node ids committed on the previous render — anything new this render is
  // "appearing" and skips the reposition transition (so it doesn't fly from origin).
  const previousIdsRef = useRef<ReadonlySet<string>>(new Set());
  const debouncedYaml = useDebouncedValue(configYaml, PARSE_DEBOUNCE_MS);

  const { nodes, error } = useMemo(() => parsePipelineFlowTree(debouncedYaml), [debouncedYaml]);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const { rfNodes, layoutEdges, translateExtent, contentHeight, legend } = useMemo(() => {
    const layout = computeFlowLayout(nodes, collapsedIds, orientation, simple);

    const callbacks: CanvasCallbacks = {
      onAddConnector,
      onAddTopic,
      onAddSasl,
      onSlotInsert,
      collapsedIds,
      toggleCollapse,
      selectedNodeId,
      lintErrorsByNode,
      flashNodeIds,
      flashToken,
      previousIds: previousIdsRef.current,
    };
    const injectedNodes = layout.rfNodes.map((node: Node) => injectNodeData(node, callbacks));

    // Allow panning a generous margin past the content (measured, since resources can
    // sit at negative x) so an edge node can be brought to the middle; the compact
    // sidebar hugs its content. The minimap stays tight to the content regardless.
    const margin = simple ? 16 : PAN_PADDING;
    const bounds = contentBounds(layout.rfNodes);
    const extent: [[number, number], [number, number]] = [
      [bounds.minX - margin, bounds.minY - margin],
      [bounds.maxX + margin, bounds.maxY + margin],
    ];

    // Which edge vocabularies appear — drives an adaptive legend (only shows the
    // kinds actually present, so trivial pipelines stay legend-free).
    const legendFlags = {
      copyMerge: layout.rfEdges.some((e: Edge) => e.id.startsWith('copy-') || e.id.startsWith('merge-')),
      error: layout.rfEdges.some((e: Edge) => (e.data as { tone?: string } | undefined)?.tone === 'error'),
      reference: layout.rfEdges.some((e: Edge) => e.id.startsWith('ref-')),
    };

    return {
      rfNodes: injectedNodes,
      layoutEdges: layout.rfEdges,
      translateExtent: extent,
      contentHeight: layout.height,
      legend: legendFlags,
    };
  }, [
    nodes,
    collapsedIds,
    orientation,
    simple,
    toggleCollapse,
    selectedNodeId,
    lintErrorsByNode,
    flashNodeIds,
    flashToken,
    onAddConnector,
    onAddTopic,
    onAddSasl,
    onSlotInsert,
  ]);

  // Record the committed node ids so the next render can tell which nodes are new
  // (and should appear in place rather than transition in from the origin).
  useEffect(() => {
    previousIdsRef.current = new Set(rfNodes.map((node) => node.id));
  }, [rfNodes]);

  // A node's "scope" — itself plus all descendants — so selecting/hovering a
  // container keeps its internal wiring (chains, copy/merge, fan edges) lit.
  const scopeOf = useCallback(
    (id: string | undefined): ReadonlySet<string> | undefined => {
      if (id === undefined) {
        return;
      }
      const childrenByParent = new Map<string | undefined, string[]>();
      for (const node of nodes) {
        const siblings = childrenByParent.get(node.parentId);
        if (siblings) {
          siblings.push(node.id);
        } else {
          childrenByParent.set(node.parentId, [node.id]);
        }
      }
      const scope = new Set([id]);
      const queue = [id];
      while (queue.length > 0) {
        for (const child of childrenByParent.get(queue.pop() as string) ?? []) {
          scope.add(child);
          queue.push(child);
        }
      }
      return scope;
    },
    [nodes]
  );

  // Hover only restyles edges, in its own (cheap) memo: the node objects above stay
  // referentially stable, so the DOM under the cursor is never rebuilt mid-hover —
  // rebuilding it fired mouseleave/mouseenter in a loop, flickering the cursor and
  // eating clicks (worst on nested nodes, whose boundaries fire extra enter/leave).
  const rfEdges = useMemo(
    () =>
      decorateEdges(layoutEdges, {
        selectedScope: scopeOf(selectedNodeId),
        hoveredScope: scopeOf(hoveredNodeId),
        onInsert,
      }),
    [layoutEdges, scopeOf, selectedNodeId, hoveredNodeId, onInsert]
  );

  if (rfNodes.length === 0) {
    return (
      <div className="relative h-full w-full">
        <PipelineFlowSkeleton error={error} />
      </div>
    );
  }

  return (
    // Compact lane: the canvas is exactly as tall as its content and top-anchored,
    // so it never re-centers as the lane resizes — the surrounding lane scrolls.
    <div className="relative w-full" style={simple ? { height: contentHeight + 16 } : { height: '100%' }}>
      <ReactFlowProvider>
        <ReactFlow
          defaultViewport={simple ? { x: 8, y: 8, zoom: 1 } : undefined}
          edges={rfEdges}
          edgeTypes={flowEdgeTypes}
          elementsSelectable={false}
          fitView={!simple}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          maxZoom={simple ? 1 : MAX_ZOOM}
          minZoom={simple ? 1 : MIN_ZOOM}
          nodes={rfNodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          nodeTypes={flowNodeTypes}
          onNodeClick={
            simple
              ? undefined
              : (_, node) => {
                  // Structural sub-nodes (switch cases, workflow stages) have no
                  // editTarget of their own — clicking one selects the nearest
                  // selectable ancestor (the parent switch / workflow).
                  const selection = selectionTargetForNode(node, rfNodes);
                  if (selection) {
                    onSelectNode?.(selection.id, selection.target);
                  }
                }
          }
          onNodeMouseEnter={simple ? undefined : (_, node) => setHoveredNodeId(node.id)}
          // Only clear when leaving the node we're tracking: crossing into a nested
          // child fires enter(child) then leave(parent), which must not wipe the
          // child's hover.
          onNodeMouseLeave={
            simple ? undefined : (_, node) => setHoveredNodeId((prev) => (prev === node.id ? undefined : prev))
          }
          onPaneClick={simple ? undefined : () => onClearSelection?.()}
          panOnDrag={!simple}
          panOnScroll={false}
          // Let the mouse wheel scroll the page rather than zoom/capture the canvas.
          // Zooming stays available via the Controls buttons and trackpad pinch.
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          translateExtent={simple ? undefined : translateExtent}
          zoomOnDoubleClick={!simple}
          zoomOnPinch={!simple}
          zoomOnScroll={false}
        >
          {simple ? null : <Background gap={20} size={1.5} variant={BackgroundVariant.Dots} />}
          {hideControls || simple ? null : (
            <Controls
              className="overflow-hidden rounded-md border border-border bg-background/90 shadow-sm backdrop-blur-sm"
              position="bottom-right"
              showInteractive={false}
            />
          )}
          {simple ? null : <PipelineMiniMap nodes={rfNodes} />}
        </ReactFlow>
      </ReactFlowProvider>
      {simple ? null : <FlowLegend flags={legend} />}
    </div>
  );
}
