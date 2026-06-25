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
  ViewportPortal,
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
// How far past the diagram the canvas may be panned, so an edge node can be brought to the middle.
const PAN_PADDING = 240;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.25;

// Bounding box of top-level nodes (children sit inside their parents). Measured, not assumed
// from origin, since resource cards can sit at negative x.
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
// Fixed width; height tracks the diagram's aspect (clamped) so the drawing fills the frame
// with no dead letterbox space the viewport can't reach.
const MINIMAP_WIDTH = 132;
const MINIMAP_MIN_INNER_H = 32;
const MINIMAP_MAX_INNER_H = 168;
const MINIMAP_PAD = 6;
// The frame's 1px border (border-box) shrinks the svg's drawing area on each side.
const MINIMAP_BORDER = 1;

// Tint each blip with its node's role accent; structural marks (section labels) drop out.
function miniMapNodeColor(node: Node): string {
  return sectionAccent((node.data as FlowCardData | undefined)?.section) ?? 'transparent';
}

// Compact overview minimap. Its drawn world is exactly the pan-REACHABLE region (see `bounds`),
// so the viewport rect fills an axis it can't pan and never leaves dead buffer. Click/drag re-centres.
function PipelineMiniMap({ nodes }: { nodes: Node[] }) {
  const transform = useStore((s) => s.transform);
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);
  const { setCenter } = useReactFlow();
  const draggingRef = useRef(false);

  // Fill the frame's content box (frame minus its 1px border each side) so nothing is clipped.
  const mapW = MINIMAP_WIDTH - 2 * MINIMAP_BORDER;

  const [tx, ty, zoom] = transform;

  // Depict only the pan-REACHABLE world. Per axis: while the viewport is smaller than the
  // translate extent (content ± PAN_PADDING) the whole extent is reachable by panning, so show
  // it; once the viewport is larger, that axis is locked and the (fixed) visible window is all
  // that's ever shown — so we never draw buffer the viewport can't reach (e.g. vertical space
  // under a single horizontal row of nodes). Locked axes use the live window, not an assumed
  // centre, since React Flow pins the oversized viewport to an edge.
  const bounds = useMemo(() => {
    const c = contentBounds(nodes);
    const ext = {
      minX: c.minX - PAN_PADDING,
      minY: c.minY - PAN_PADDING,
      maxX: c.maxX + PAN_PADDING,
      maxY: c.maxY + PAN_PADDING,
    };
    const viewLeft = -tx / zoom;
    const viewTop = -ty / zoom;
    const vw = paneWidth / zoom;
    const vh = paneHeight / zoom;
    const canPanX = vw < ext.maxX - ext.minX;
    const canPanY = vh < ext.maxY - ext.minY;
    return {
      minX: canPanX ? ext.minX : viewLeft,
      maxX: canPanX ? ext.maxX : viewLeft + vw,
      minY: canPanY ? ext.minY : viewTop,
      maxY: canPanY ? ext.maxY : viewTop + vh,
    };
  }, [nodes, tx, ty, zoom, paneWidth, paneHeight]);
  const contentW = Math.max(bounds.maxX - bounds.minX, 1);
  const contentH = Math.max(bounds.maxY - bounds.minY, 1);
  const innerW = mapW - 2 * MINIMAP_PAD;
  // Match the content's aspect so the drawing fills the frame; clamp extreme ratios to stay usable.
  const innerH = Math.min(Math.max(innerW * (contentH / contentW), MINIMAP_MIN_INNER_H), MINIMAP_MAX_INNER_H);
  const mapH = innerH + 2 * MINIMAP_PAD;
  const scale = Math.min(innerW / contentW, innerH / contentH);
  // Centre the content within the frame.
  const offsetX = MINIMAP_PAD + (innerW - contentW * scale) / 2 - bounds.minX * scale;
  const offsetY = MINIMAP_PAD + (innerH - contentH * scale) / 2 - bounds.minY * scale;

  // Viewport in minimap coords, clamped to the drawing area (1px stroke inset) so its border
  // stays visible even when the view extends into the pan padding.
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
      style={{ width: MINIMAP_WIDTH, height: mapH + 2 * MINIMAP_BORDER, right: 52, bottom: 12 }}
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

// Margin (px) between the revealed node and the canvas edge, and how long to wait for the
// inspector rail's open animation to settle before measuring.
const SELECTION_REVEAL_MARGIN = 32;
const RAIL_SETTLE_MS = 240;

// Keeps the selected node visible when the inspector rail opens. The rail is a flex sibling
// that steals ~384px on the right, so a node near the right edge ends up hidden behind it.
// Once the rail's open animation settles (pane stops resizing), nudge the viewport just enough
// to reveal the node — only if actually clipped. The minimal dx stays inside `translateExtent`,
// so no clamping is needed.
function KeepSelectionInView({ selectedNodeId, enabled }: { selectedNodeId?: string; enabled: boolean }) {
  const { getNodesBounds, getViewport, setViewport } = useReactFlow();
  // Re-runs as the canvas resizes during the rail animation; each change resets the settle
  // timer, so the nudge fires once the pane width finally stops changing.
  const paneWidth = useStore((s) => s.width);

  useEffect(() => {
    // Disabled in the static (sidebar) overview, and a no-op until something is selected.
    if (!(enabled && selectedNodeId)) {
      return;
    }
    const timer = setTimeout(() => {
      const bounds = getNodesBounds([selectedNodeId]);
      if (!bounds || bounds.width === 0) {
        return;
      }
      const { x, y, zoom } = getViewport();
      const screenLeft = bounds.x * zoom + x;
      const screenRight = (bounds.x + bounds.width) * zoom + x;
      let dx = 0;
      if (screenRight > paneWidth - SELECTION_REVEAL_MARGIN) {
        // Off the right edge / behind the rail — pan content left to reveal it.
        dx = paneWidth - SELECTION_REVEAL_MARGIN - screenRight;
      } else if (screenLeft < SELECTION_REVEAL_MARGIN) {
        dx = SELECTION_REVEAL_MARGIN - screenLeft;
      }
      if (dx !== 0) {
        setViewport({ x: x + dx, y, zoom }, { duration: 200 });
      }
    }, RAIL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [enabled, selectedNodeId, paneWidth, getNodesBounds, getViewport, setViewport]);

  return null;
}

// Padding (px) between a construct's members and the region edge. TOP gets extra room so the
// region's label sits in a clear band above the first member, never over it.
const SCOPE_REGION_PAD = 16;
const SCOPE_REGION_TOP_PAD = 34;
// Extra padding per nesting level inside a region, so an outer region stands off from the inner
// ones it contains (else nested boxes sharing an extreme member draw flush).
const SCOPE_REGION_NEST_STEP = 12;

// Accent colour for a construct's scope region: red for error/dead-letter (catch), else the role accent.
function constructAccent(node?: Node): string {
  const d = node?.data as FlowCardData | undefined;
  if (d?.isErrorPath) {
    return 'var(--color-destructive)';
  }
  return sectionAccent(d?.section) ?? 'var(--color-primary)';
}

type ScopeBounds = { minX: number; minY: number; maxX: number; maxY: number };

// Bounding box (flow coords) of every node in `scope` — including merge dots, which sit outside
// the parser tree but carry their construct's id as `ownerId`.
function scopeMemberBounds(nodes: Node[], scope: ReadonlySet<string>): ScopeBounds | null {
  let b: ScopeBounds | null = null;
  for (const n of nodes) {
    if (!(scope.has(n.id) || scope.has((n.data as FlowCardData).ownerId ?? ' '))) {
      continue;
    }
    const w = (n.initialWidth ?? n.width ?? 0) as number;
    const h = (n.initialHeight ?? n.height ?? 0) as number;
    const right = n.position.x + w;
    const bottom = n.position.y + h;
    b = b
      ? {
          minX: Math.min(b.minX, n.position.x),
          minY: Math.min(b.minY, n.position.y),
          maxX: Math.max(b.maxX, right),
          maxY: Math.max(b.maxY, bottom),
        }
      : { minX: n.position.x, minY: n.position.y, maxX: right, maxY: bottom };
  }
  return b;
}

// True if any node OUTSIDE the scope overlaps the padded member box — i.e. the region would
// enclose/cut through an unrelated card. Dagre doesn't keep a construct's members spatially
// contiguous (e.g. a `catch`'s `log` inside a `try`'s span); callers skip the box when this is true.
function boxEnclosesForeignNode(nodes: Node[], scope: ReadonlySet<string>, b: ScopeBounds, pad: number): boolean {
  const left = b.minX - pad;
  const right = b.maxX + pad;
  const top = b.minY - pad;
  const bottom = b.maxY + pad;
  for (const n of nodes) {
    // Members and the construct's own "+ Add" ghost pills aren't foreign content.
    if (scope.has(n.id) || scope.has((n.data as FlowCardData).ownerId ?? ' ') || n.type === 'flowInsert') {
      continue;
    }
    const w = (n.initialWidth ?? n.width ?? 0) as number;
    const h = (n.initialHeight ?? n.height ?? 0) as number;
    if (n.position.x < right && n.position.x + w > left && n.position.y < bottom && n.position.y + h > top) {
      return true;
    }
  }
  return false;
}

type ScopeRegion = {
  id: string;
  scope: ReadonlySet<string>;
  bounds: ScopeBounds;
  accent: string;
  label: string;
  /** Side / top padding — larger for outer regions so nested ones don't touch. */
  pad: number;
  topPad: number;
};

// One construct's enclosure box. Drawn FAINT (a quiet nesting hint); it and its label
// strengthen when the construct, or anything inside it, is the active (selected/hovered) node.
// Non-interactive, behind the nodes, in flow coordinates.
function RegionBox({ region, active }: { region: ScopeRegion; active: boolean }) {
  const { bounds, accent, label, pad, topPad } = region;
  return (
    <div
      className="pointer-events-none absolute rounded-xl border border-dashed transition-[background-color,border-color] duration-200"
      style={{
        transform: `translate(${bounds.minX - pad}px, ${bounds.minY - topPad}px)`,
        width: bounds.maxX - bounds.minX + 2 * pad,
        height: bounds.maxY - bounds.minY + topPad + pad,
        borderColor: `color-mix(in srgb, ${accent} ${active ? 70 : 32}%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${accent} ${active ? 10 : 5}%, transparent)`,
        zIndex: 0,
      }}
    >
      {/* Seated in the reserved top band, never over a member card. Faint until active. */}
      <span
        className="absolute top-1.5 left-2 rounded px-1.5 py-0.5 font-semibold text-[10px] uppercase tracking-wide transition-opacity duration-200"
        style={{
          color: accent,
          opacity: active ? 1 : 0.8,
          backgroundColor: 'var(--color-background)',
          border: `1px solid color-mix(in srgb, ${accent} ${active ? 55 : 32}%, transparent)`,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// Faint enclosure boxes around every control-flow construct's sub-graph, emphasized when the
// construct (or anything inside it) is selected/hovered. Drawn via `ViewportPortal` (flow coords,
// moves with pan/zoom), behind the nodes, non-interactive — so it never perturbs the nodes array
// (hover stays cheap). A box is skipped when it would enclose an unrelated card — see
// `boxEnclosesForeignNode`.
function ScopeRegions({
  hoveredId,
  selectedId,
  rfNodes,
  scopeOf,
}: {
  hoveredId?: string;
  selectedId?: string;
  rfNodes: Node[];
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined;
}) {
  // Geometry depends only on the layout, so cache it across hover/selection changes.
  const regions = useMemo<ScopeRegion[]>(() => {
    type Draft = Omit<ScopeRegion, 'pad' | 'topPad'>;
    const drafts: Draft[] = [];
    for (const node of rfNodes) {
      if (node.type !== 'flowSplit') {
        continue;
      }
      const scope = scopeOf(node.id);
      if (!scope || scope.size < 2) {
        continue;
      }
      const bounds = scopeMemberBounds(rfNodes, scope);
      if (!bounds || boxEnclosesForeignNode(rfNodes, scope, bounds, SCOPE_REGION_PAD)) {
        continue;
      }
      drafts.push({
        id: node.id,
        scope,
        bounds,
        accent: constructAccent(node),
        label: (node.data as FlowCardData).label,
      });
    }
    // How many OTHER regions enclose each (its construct id is in their scope). Most-nested keeps
    // base padding; each enclosing region gets one step more so outer boxes stand off from inner ones.
    const depthOf = (r: Draft) => drafts.filter((o) => o.id !== r.id && o.scope.has(r.id)).length;
    const depths = drafts.map(depthOf);
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
    return drafts.map((r, i) => {
      const extra = (maxDepth - depths[i]) * SCOPE_REGION_NEST_STEP;
      return { ...r, pad: SCOPE_REGION_PAD + extra, topPad: SCOPE_REGION_TOP_PAD + extra };
    });
  }, [rfNodes, scopeOf]);

  if (regions.length === 0) {
    return null;
  }
  // A region is emphasized when the active node is the construct itself or anywhere in its
  // sub-graph (incl. a merge dot, matched via owner id).
  const activeId = hoveredId ?? selectedId;
  const activeOwner = activeId
    ? (rfNodes.find((n) => n.id === activeId)?.data as FlowCardData | undefined)?.ownerId
    : undefined;
  return (
    <ViewportPortal>
      {regions.map((region) => {
        const active =
          activeId !== undefined &&
          (region.scope.has(activeId) || (activeOwner ? region.scope.has(activeOwner) : false));
        return <RegionBox active={active} key={region.id} region={region} />;
      })}
    </ViewportPortal>
  );
}

type CanvasCallbacks = {
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  onSlotInsert?: (payload: FlowInsertPayload) => void;
  /** Select a node + edit target (used to open the switch-case editor from a chip click). */
  onSelectNode?: (nodeId: string, target: EditTarget, caseTarget?: EditTarget) => void;
  collapsedIds: ReadonlySet<string>;
  toggleCollapse: (nodeId: string) => void;
  selectedNodeId?: string;
  /** Kind of the selected edit target — `'switchCase'` means the condition, not the component. */
  selectedTargetKind?: string;
  lintErrorsByNode?: Map<string, string[]>;
  flashNodeIds?: ReadonlySet<string>;
  flashToken?: number;
  /** Node ids present on the previous render — anything new is "appearing". */
  previousIds: ReadonlySet<string>;
};

// Edit-mode action callbacks (add connector / topic / sasl, the nested-insert "+") wired onto a
// node's data. Split out of `injectNodeData` to keep each function's branching simple.
function wireNodeActions(data: FlowCardData, node: Node, cb: CanvasCallbacks): void {
  if (data.label === 'none' && cb.onAddConnector) {
    data.onAddConnector = cb.onAddConnector;
  }
  if (data.missingTopic && cb.onAddTopic) {
    data.onAddTopic = cb.onAddTopic;
  }
  if (data.missingSasl && cb.onAddSasl) {
    data.onAddSasl = cb.onAddSasl;
  }
  if (data.addAction && cb.onSlotInsert) {
    const payload = data.addAction.payload;
    data.onAddChild = () => cb.onSlotInsert?.(payload);
  }
  if (node.type === 'flowInsert' && cb.onSlotInsert) {
    (data as { onInsert?: (payload: FlowInsertPayload) => void }).onInsert = cb.onSlotInsert;
  }
}

export function injectNodeData(node: Node, cb: CanvasCallbacks): Node {
  const data = { ...node.data } as FlowCardData;
  if (data.collapsible) {
    data.collapsed = cb.collapsedIds.has(node.id);
    data.onToggle = () => cb.toggleCollapse(node.id);
  }
  if (cb.selectedNodeId && node.id === cb.selectedNodeId) {
    // Condition-chip and body clicks both report THIS node selected; the target kind picks
    // whether to ring just the condition row (case) or the whole card (component).
    if (data.caseEditTarget && cb.selectedTargetKind === 'switchCase') {
      data.conditionSelected = true;
    } else {
      data.selected = true;
    }
  }
  const lintErrors = cb.lintErrorsByNode?.get(node.id);
  if (lintErrors?.length) {
    data.lintErrors = lintErrors;
  }
  if (cb.flashNodeIds?.has(node.id)) {
    data.flash = true;
    data.flashToken = cb.flashToken;
  }
  wireNodeActions(data, node, cb);
  // A node new this render (e.g. revealed by expanding its container) should appear in place,
  // not slide from the origin: drop the transform transition so it snaps, and let the card fade
  // + grow in (see `appeared`).
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

type LegendFlags = { condition: boolean; error: boolean; reference: boolean };

// A line swatch matching the edge styles drawn on the canvas.
function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      className="inline-block h-0 w-5 shrink-0 align-middle"
      style={{ borderTopColor: color, borderTopWidth: 2, borderTopStyle: dashed ? 'dashed' : 'solid' }}
    />
  );
}

// A filled chip swatch for node-borne vocabulary (the gold routing condition), vs. edge line swatches.
function LegendChipSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-5 shrink-0 rounded-sm align-middle"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, border: `1px solid ${color}` }}
    />
  );
}

// Explains the diagram vocabulary; only the kinds present in the current diagram are listed.
function FlowLegend({ flags }: { flags: LegendFlags }) {
  if (!(flags.condition || flags.error || flags.reference)) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-md border border-border bg-background/90 px-3 py-2 text-muted-foreground text-xs shadow-sm backdrop-blur-sm">
      <div className="font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wide">Legend</div>
      <div className="flex items-center gap-2">
        <LegendSwatch color="var(--color-primary)" />
        Data flow
      </div>
      {flags.condition ? (
        <div className="flex items-center gap-2">
          <LegendChipSwatch color="var(--color-condition)" />
          Routing condition
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
  /** Nested insert (into a control-flow body) carried on an edge's `slotPayload`. */
  onSlotInsert?: (payload: FlowInsertPayload) => void;
  /** Click a routing-condition label to edit its case (`selectId`/`selectTarget` on the edge). */
  onSelectNode?: (nodeId: string, target: EditTarget, caseTarget?: EditTarget) => void;
};

// Highlighted edges render in `primary`; recolour the arrowhead to match. Error edges keep
// their red markers — those semantics win over the highlight.
function withHighlightMarker(edge: Edge): Edge {
  const tone = (edge.data as { tone?: string } | undefined)?.tone;
  if (tone === 'error' || typeof edge.markerEnd !== 'object' || !edge.markerEnd) {
    return edge;
  }
  return { ...edge, markerEnd: { ...edge.markerEnd, color: 'var(--color-primary)' } };
}

// Reference edges are context lines (dashed, muted), so they never fully dim — they stay at the
// readable "faint" tier even when an unrelated node is selected. An active endpoint highlights them.
function decorateReferenceEdge(edge: Edge, activeScope: ReadonlySet<string> | undefined): Edge {
  const touchesActive = activeScope !== undefined && (activeScope.has(edge.source) || activeScope.has(edge.target));
  const next = { ...edge, data: { ...edge.data, emphasized: touchesActive, faint: !touchesActive } };
  return touchesActive ? withHighlightMarker(next) : next;
}

// Per-render edge styling: reference edges stay faint until an endpoint is active; a selection
// emphasizes its own edges (incl. inside a selected container) and dims the rest; spine edges get
// their insert (+) handler.
export function decorateEdges(
  edges: Edge[],
  { selectedScope, hoveredScope, onInsert, onSlotInsert, onSelectNode }: DecorateEdgeOptions
): Edge[] {
  const activeScope = selectedScope ?? hoveredScope;
  return edges.map((edge) => {
    let next = edge;
    const edgeData = next.data as
      | { insertIndex?: number; slotPayload?: FlowInsertPayload; selectId?: string; selectTarget?: EditTarget }
      | undefined;
    const insertIndex = edgeData?.insertIndex;
    const slotPayload = edgeData?.slotPayload;
    if (onInsert && (next.type === 'flowSpine' || next.type === 'flowGraphEdge') && insertIndex !== undefined) {
      next = { ...next, data: { ...next.data, onInsert: () => onInsert(insertIndex) } };
    } else if (onSlotInsert && next.type === 'flowGraphEdge' && slotPayload) {
      next = { ...next, data: { ...next.data, onInsert: () => onSlotInsert(slotPayload) } };
    }
    // A routing-condition label that selects its case to edit the condition.
    if (onSelectNode && edgeData?.selectId && edgeData.selectTarget) {
      const { selectId, selectTarget } = edgeData;
      next = { ...next, data: { ...next.data, onLabelClick: () => onSelectNode(selectId, selectTarget) } };
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

// What a click on `node` selects: the node itself if editable, else its nearest selectable
// ancestor. Structural sub-nodes (switch cases, workflow stages) have no `editTarget`, so
// clicking one selects the parent switch/workflow.
export function selectionTargetForNode(
  node: Node,
  nodes: Node[]
): { id: string; target: EditTarget; caseTarget?: EditTarget } | null {
  let current: Node | undefined = node;
  while (current && !(current.data as FlowCardData).editTarget) {
    // The block layout positions nodes absolutely (no RF parentId), so walk the logical
    // owner carried in data; the compact lane still nests via parentId.
    const ownerId: string | undefined = current.parentId ?? (current.data as FlowCardData).ownerId;
    current = ownerId ? nodes.find((n) => n.id === ownerId) : undefined;
  }
  const target = current && (current.data as FlowCardData).editTarget;
  if (!(current && target)) {
    return null;
  }
  // A case-entry node also carries its routing-condition target so the inspector can edit the
  // condition (in its own section) alongside the component's config.
  const caseTarget = (current.data as FlowCardData).caseEditTarget;
  return caseTarget ? { id: current.id, target, caseTarget } : { id: current.id, target };
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
  /** Kind of the selected edit target — `'switchCase'` highlights the condition, not the card. */
  selectedTargetKind?: string;
  /** Lint messages mapped to node ids — badged in place on the canvas. */
  lintErrorsByNode?: Map<string, string[]>;
  /** Node ids to briefly pulse (e.g. after undo/redo), with a token to replay it. */
  flashNodeIds?: ReadonlySet<string>;
  flashToken?: number;
  /** Select a node by id + its edit target (clicking a node). */
  onSelectNode?: (nodeId: string, target: EditTarget, caseTarget?: EditTarget) => void;
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
  selectedTargetKind,
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
  // Node ids committed last render; anything new this render "appears" in place and skips the
  // reposition transition (so it doesn't fly from origin).
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
    // Edit mode (nested inserts wired) shows the ghost "add" branches; read-only hides them.
    const editable = Boolean(onSlotInsert);
    const layout = computeFlowLayout(nodes, collapsedIds, orientation, simple, editable);

    const callbacks: CanvasCallbacks = {
      onAddConnector,
      onAddTopic,
      onAddSasl,
      onSlotInsert,
      onSelectNode,
      collapsedIds,
      toggleCollapse,
      selectedNodeId,
      selectedTargetKind,
      lintErrorsByNode,
      flashNodeIds,
      flashToken,
      previousIds: previousIdsRef.current,
    };
    const injectedNodes = layout.rfNodes.map((node: Node) => injectNodeData(node, callbacks));

    // Allow panning a margin past the content (measured, since resources sit at negative x) so
    // an edge node can reach the middle; the compact sidebar hugs its content.
    const margin = simple ? 16 : PAN_PADDING;
    const bounds = contentBounds(layout.rfNodes);
    const extent: [[number, number], [number, number]] = [
      [bounds.minX - margin, bounds.minY - margin],
      [bounds.maxX + margin, bounds.maxY + margin],
    ];

    // Which vocabularies appear — drives the adaptive legend (trivial pipelines stay legend-free).
    const legendFlags = {
      condition: layout.rfNodes.some((n: Node) => Boolean((n.data as FlowCardData | undefined)?.caseEditTarget)),
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
    selectedTargetKind,
    lintErrorsByNode,
    flashNodeIds,
    flashToken,
    onAddConnector,
    onAddTopic,
    onAddSasl,
    onSlotInsert,
    onSelectNode,
  ]);

  // Record the committed node ids so the next render can tell which nodes are new.
  useEffect(() => {
    previousIdsRef.current = new Set(rfNodes.map((node) => node.id));
  }, [rfNodes]);

  // A node's "scope" — itself plus all descendants — so selecting/hovering a container keeps its
  // internal wiring (chains, copy/merge, fan edges) lit.
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

  // Hover only restyles edges, in its own cheap memo, so the node objects stay referentially
  // stable and the DOM under the cursor isn't rebuilt mid-hover — rebuilding it looped
  // mouseleave/mouseenter, flickering the cursor and eating clicks (worst on nested nodes).
  const rfEdges = useMemo(
    () =>
      decorateEdges(layoutEdges, {
        selectedScope: scopeOf(selectedNodeId),
        hoveredScope: scopeOf(hoveredNodeId),
        onInsert,
        onSlotInsert,
        onSelectNode,
      }),
    [layoutEdges, scopeOf, selectedNodeId, hoveredNodeId, onInsert, onSlotInsert, onSelectNode]
  );

  if (rfNodes.length === 0) {
    return (
      <div className="relative h-full w-full">
        <PipelineFlowSkeleton error={error} />
      </div>
    );
  }

  return (
    // Compact lane: canvas is exactly as tall as its content and top-anchored, so it never
    // re-centers as the lane resizes — the surrounding lane scrolls.
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
                  // Structural sub-nodes have no editTarget — clicking selects the nearest
                  // selectable ancestor (see selectionTargetForNode).
                  const selection = selectionTargetForNode(node, rfNodes);
                  if (selection) {
                    onSelectNode?.(selection.id, selection.target, selection.caseTarget);
                  }
                }
          }
          onNodeMouseEnter={simple ? undefined : (_, node) => setHoveredNodeId(node.id)}
          // Only clear when leaving the tracked node: crossing into a nested child fires
          // enter(child) then leave(parent), which must not wipe the child's hover.
          onNodeMouseLeave={
            simple ? undefined : (_, node) => setHoveredNodeId((prev) => (prev === node.id ? undefined : prev))
          }
          onPaneClick={simple ? undefined : () => onClearSelection?.()}
          panOnDrag={!simple}
          panOnScroll={false}
          // Let the mouse wheel scroll the page rather than zoom the canvas; zoom stays available
          // via the Controls buttons and trackpad pinch.
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
          {/* Renders only for control-flow markers (flowSplit/flowMerge), present only on the
              full canvas — the compact sidebar gets nothing. */}
          <ScopeRegions hoveredId={hoveredNodeId} rfNodes={rfNodes} scopeOf={scopeOf} selectedId={selectedNodeId} />
          <KeepSelectionInView enabled={!simple} selectedNodeId={selectedNodeId} />
        </ReactFlow>
      </ReactFlowProvider>
      {simple ? null : <FlowLegend flags={legend} />}
    </div>
  );
}
