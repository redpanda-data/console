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
  useStoreApi,
  ViewportPortal,
} from '@xyflow/react';
import { Banner, BannerContent } from 'components/redpanda-ui/components/banner';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import { TriangleAlert } from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { FlowCardData } from './pipeline-flow-canvas-nodes';
import { flowEdgeTypes, flowNodeTypes, sectionAccent } from './pipeline-flow-canvas-nodes';
import { PipelineFlowSkeleton } from './pipeline-flow-nodes';
import {
  computeGraphLayout,
  type FlowInsertPayload,
  type PipelineFlowNode,
  parsePipelineFlowTree,
} from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const PARSE_DEBOUNCE_MS = 300;
// How far past the diagram the canvas may be panned, so an edge node can be brought to the middle.
const PAN_PADDING = 240;

// RF's pan/zoom eases are d3-driven (JS), out of reach of the CSS reduced-motion rule — honour it
// here by collapsing animated moves to instant.
const animMs = (ms: number): number =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
// Default interactive zoom-out floor for normal-sized graphs.
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.25;
// Floor for graphs too big to fit even at MIN_ZOOM — never below this, so it can't zoom out to a dot.
const ABSOLUTE_MIN_ZOOM = 0.05;

// Zoom-out floor for a `graphW`×`graphH` graph in a `paneW`×`paneH` pane: MIN_ZOOM normally, lower
// (to ABSOLUTE_MIN_ZOOM) when too big to fit — so large graphs zoom out until fully visible, no further.
function fitMinZoom(graphW: number, graphH: number, paneW: number, paneH: number): number {
  if (graphW <= 0 || graphH <= 0 || paneW <= 0 || paneH <= 0) {
    return MIN_ZOOM;
  }
  // 0.9 leaves a little margin around the fully-zoomed-out graph.
  const fit = 0.9 * Math.min(paneW / graphW, paneH / graphH);
  return Math.min(MIN_ZOOM, Math.max(ABSOLUTE_MIN_ZOOM, fit));
}

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
// Inset between drawing and frame so the viewport rect's border stays visible at the pan limits.
const MINIMAP_PAD = 2;
// The frame's 1px border (border-box) shrinks the svg's drawing area on each side.
const MINIMAP_BORDER = 1;

const clampValue = (value: number, lo: number, hi: number): number => Math.min(Math.max(value, lo), hi);

// Tint each blip with its node's role accent; structural marks (section labels) drop out.
function miniMapNodeColor(node: Node): string {
  return sectionAccent((node.data as FlowCardData | undefined)?.section) ?? 'transparent';
}

// Compact overview minimap. Its drawn world is exactly the pan-REACHABLE region (see `world`),
// so the viewport rect fills an axis it can't pan and never leaves dead buffer. Click/drag re-centres.
function PipelineMiniMap({
  nodes,
  translateExtent,
}: {
  nodes: Node[];
  translateExtent: [[number, number], [number, number]];
}) {
  const transform = useStore((s) => s.transform);
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);
  const { setCenter } = useReactFlow();
  const draggingRef = useRef(false);

  // Fill the frame's content box (frame minus its 1px border each side) so nothing is clipped.
  const mapW = MINIMAP_WIDTH - 2 * MINIMAP_BORDER;

  const [tx, ty, zoom] = transform;
  const viewLeft = -tx / zoom;
  const viewTop = -ty / zoom;
  const vw = paneWidth / zoom;
  const vh = paneHeight / zoom;

  // The exact area canvas drag can reach — the SAME `translateExtent` passed to <ReactFlow> — so
  // the minimap never disagrees with the canvas about what's reachable.
  const ext = useMemo(
    () => ({
      minX: translateExtent[0][0],
      minY: translateExtent[0][1],
      maxX: translateExtent[1][0],
      maxY: translateExtent[1][1],
    }),
    [translateExtent]
  );

  // Draw only the pan-REACHABLE world. Per axis: if the viewport is smaller than the extent the whole
  // extent is reachable, so show it; else the axis is locked, so show the live visible window — RF
  // pins an oversized viewport to an edge, not an assumed centre — never buffer that can't be reached.
  const canPanX = vw < ext.maxX - ext.minX;
  const canPanY = vh < ext.maxY - ext.minY;
  const world = {
    minX: canPanX ? ext.minX : viewLeft,
    maxX: canPanX ? ext.maxX : viewLeft + vw,
    minY: canPanY ? ext.minY : viewTop,
    maxY: canPanY ? ext.maxY : viewTop + vh,
  };
  const worldW = Math.max(world.maxX - world.minX, 1);
  const worldH = Math.max(world.maxY - world.minY, 1);

  // World fills the drawing area (frame minus MINIMAP_PAD). Frame height tracks the world's aspect
  // (clamped); each axis scales independently to fill exactly, so a clamp-forced aspect mismatch
  // can't leave unreachable dead bands.
  const innerW = mapW - 2 * MINIMAP_PAD;
  const innerH = clampValue(innerW * (worldH / worldW), MINIMAP_MIN_INNER_H, MINIMAP_MAX_INNER_H);
  const mapH = innerH + 2 * MINIMAP_PAD;
  const scaleX = innerW / worldW;
  const scaleY = innerH / worldH;
  const offsetX = MINIMAP_PAD - world.minX * scaleX;
  const offsetY = MINIMAP_PAD - world.minY * scaleY;

  // The world always contains the viewport, so the rect sits within the padded drawing area with
  // no clamping; on a locked axis it fills that axis edge-to-edge.
  const view = { x: viewLeft * scaleX + offsetX, y: viewTop * scaleY + offsetY, w: vw * scaleX, h: vh * scaleY };

  const panToEvent = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left - offsetX) / scaleX;
    const fy = (e.clientY - rect.top - offsetY) / scaleY;
    // Clamp the target centre so click-to-pan obeys the same extent as drag; lock to the extent
    // centre on an axis too small to pan.
    const cx = canPanX ? clampValue(fx, ext.minX + vw / 2, ext.maxX - vw / 2) : (ext.minX + ext.maxX) / 2;
    const cy = canPanY ? clampValue(fy, ext.minY + vh / 2, ext.maxY - vh / 2) : (ext.minY + ext.maxY) / 2;
    setCenter(cx, cy, { zoom, duration: 0 });
  };

  return (
    <div
      className="nodrag nopan absolute z-10 overflow-hidden rounded-md border border-border bg-card shadow-sm"
      style={{ width: MINIMAP_WIDTH, height: mapH + 2 * MINIMAP_BORDER, right: 52, bottom: 12 }}
    >
      <svg
        aria-label="Pipeline overview"
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
        role="img"
        width={mapW}
      >
        {nodes.map((node) => {
          const color = miniMapNodeColor(node);
          if (node.parentId || color === 'transparent') {
            return null;
          }
          const w = ((node.initialWidth ?? node.width ?? 0) as number) * scaleX;
          const h = ((node.initialHeight ?? node.height ?? 0) as number) * scaleY;
          return (
            <rect
              height={Math.max(h, 2)}
              key={node.id}
              rx={1.5}
              style={{ fill: color, opacity: 0.85 }}
              width={Math.max(w, 2)}
              x={node.position.x * scaleX + offsetX}
              y={node.position.y * scaleY + offsetY}
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

// Parse the YAML, holding the last-good nodes. While the YAML is transiently invalid (mid-edit, bad
// paste) the parser yields nothing; blanking the canvas loses the user's place and reads as broken,
// so we freeze the last-good graph and flag it stale (Step Functions / Kestra pattern).
function useResilientParse(yaml: string): { nodes: PipelineFlowNode[]; error?: string; showingStale: boolean } {
  const parsed = useMemo(() => parsePipelineFlowTree(yaml), [yaml]);
  const lastGoodNodesRef = useRef<PipelineFlowNode[]>(parsed.nodes);
  if (!parsed.error) {
    lastGoodNodesRef.current = parsed.nodes;
  }
  const showingStale = Boolean(parsed.error) && parsed.nodes.length === 0 && lastGoodNodesRef.current.length > 0;
  return { nodes: showingStale ? lastGoodNodesRef.current : parsed.nodes, error: parsed.error, showingStale };
}

// A node belongs to a construct's scope if it's a member by id, or carries the construct's id as
// `ownerId` (merge dots and other marks that sit outside the parser tree).
function nodeInScope(node: Node, scope: ReadonlySet<string>): boolean {
  return scope.has(node.id) || scope.has((node.data as FlowCardData).ownerId ?? ' ');
}

// Selecting a control-flow construct focuses its branch: nodes OUTSIDE its scope fade back, so the
// construct's members read clearly. Complements the always-on region box and the edge-scope dimming.
function focusDimNodes(
  rfNodes: Node[],
  selectedNodeId: string | undefined,
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined
): Node[] {
  const selectedNode = selectedNodeId ? rfNodes.find((n) => n.id === selectedNodeId) : undefined;
  const focus = selectedNode?.type === 'flowSplit' ? scopeOf(selectedNodeId) : undefined;
  if (!focus) {
    return rfNodes;
  }
  return rfNodes.map((node) => {
    const inScope = nodeInScope(node, focus);
    return inScope
      ? node
      : {
          ...node,
          style: { ...(node.style as Record<string, unknown>), opacity: 0.3, transition: 'opacity 200ms ease' },
        };
  });
}

// The graph fades back while it's showing the stale (last-good) layout, cueing that it's not live.
const staleFlowClass = (stale: boolean): string => `transition-opacity duration-200 ${stale ? 'opacity-60' : ''}`;

// Non-destructive banner shown while the canvas is rendering the last-good graph for invalid YAML
// (see useResilientParse). A status region so it's announced; sits above the dimmed graph.
function StaleParseBanner({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return (
    <output className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-1.5 text-foreground text-sm shadow-sm backdrop-blur-sm">
      <TriangleAlert className="size-4 shrink-0 text-warning" />
      <span>Can&apos;t parse the latest YAML — showing the last valid layout.</span>
    </output>
  );
}

// The zoom tool's armed state: a magnifier-`+` (zoom in) or `-` (zoom out) cursor, or off.
type ZoomMode = 'in' | 'out' | null;
const ZOOM_STEP = 1.5;

function cursorForMode(mode: ZoomMode): string {
  if (mode === 'in') {
    return 'zoom-in';
  }
  if (mode === 'out') {
    return 'zoom-out';
  }
  return '';
}

// Paint the magnifier cursor while the zoom tool is armed. Set inline on the container AND its pane:
// RF styles the pane cursor itself so a Tailwind class loses, but an inline style on the pane wins —
// and the container style covers nodes by inheritance.
function useZoomCursor(mode: ZoomMode, ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) {
      return;
    }
    const cursor = cursorForMode(mode);
    const panes = Array.from(root.querySelectorAll<HTMLElement>('.react-flow__pane'));
    root.style.cursor = cursor;
    for (const pane of panes) {
      pane.style.cursor = cursor;
    }
    return () => {
      root.style.cursor = '';
      for (const pane of panes) {
        pane.style.cursor = '';
      }
    };
  }, [mode, ref]);
}

// Free-pan is on for the full canvas, but suppressed while the zoom tool is armed — otherwise a
// pan-drag ends in a click the zoom tool would act on, jumping the view.
const canPanCanvas = (mode: ZoomMode): boolean => mode === null;

// The zoom tool is SPRING-LOADED: held Z → zoom-in, held Z + Option/Alt → zoom-out (Figma-style),
// nothing held → off.
function heldZoomMode(zDown: boolean, alt: boolean): ZoomMode {
  if (!zDown) {
    return null;
  }
  return alt ? 'out' : 'in';
}

const isTypingTarget = (target: EventTarget | null): boolean =>
  Boolean((target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"], .monaco-editor'));

// Figma-style hold-to-activate zoom: while Z is held the cursor is a magnifier and a click zooms
// toward the pointer (add Option/Alt to zoom out); releasing returns to pan/select. Pan is suppressed
// only while held (canPanCanvas). The wheel is left to the page; Controls + pinch also zoom. Ignored
// while typing.
function ZoomTool({ mode, setMode, minZoom }: { mode: ZoomMode; setMode: (next: ZoomMode) => void; minZoom: number }) {
  const { screenToFlowPosition, getZoom, setCenter } = useReactFlow();

  // Track the physical key-hold state and derive the mode — keydown/keyup, plus blur so a release
  // missed while the window was unfocused can't leave the tool stuck on.
  useEffect(() => {
    let zDown = false;
    let altHeld = false;
    const sync = () => setMode(heldZoomMode(zDown, altHeld));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altHeld = true;
        sync();
        return;
      }
      // Match on `code` (not `key`) so Option+Z on macOS — which emits a special character — still
      // registers as Z. Meta/Ctrl are reserved for the app shell, so ignore those combos.
      if (e.code !== 'KeyZ' || e.metaKey || e.ctrlKey || isTypingTarget(e.target)) {
        return;
      }
      e.preventDefault();
      zDown = true;
      altHeld = e.altKey;
      sync();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altHeld = false;
      } else if (e.code === 'KeyZ') {
        zDown = false;
      } else {
        return;
      }
      sync();
    };
    const reset = () => {
      zDown = false;
      altHeld = false;
      sync();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', reset);
    };
  }, [setMode]);

  useEffect(() => {
    if (!mode) {
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest('.react-flow__pane, .react-flow__node')) {
        return;
      }
      // Take the click before React Flow's select/deselect runs, and zoom toward the pointer.
      e.preventDefault();
      e.stopPropagation();
      const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const next = clampValue(getZoom() * (mode === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP), minZoom, MAX_ZOOM);
      setCenter(point.x, point.y, { zoom: next, duration: animMs(200) });
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [mode, minZoom, screenToFlowPosition, getZoom, setCenter]);

  return null;
}

// Frame the graph on first load: centered and zoomed out to fit (down to the zoom floor for graphs
// too big to fit). Retries each frame — reading pane size and node bounds FRESH — until both are
// real (pane laid out + nodes measured), so it fires ASAP rather than waiting for a later resize
// (which read as a "snap").
function FitOnInit() {
  const nodeCount = useStore((s) => s.nodes.length);
  const storeApi = useStoreApi();
  const { getNodes, getNodesBounds, fitView } = useReactFlow();
  const doneRef = useRef(false);
  useEffect(() => {
    if (doneRef.current || nodeCount === 0) {
      return;
    }
    let raf = 0;
    let tries = 0;
    const place = () => {
      const { width, height } = storeApi.getState();
      const bounds = getNodesBounds(getNodes());
      if (width > 0 && height > 0 && bounds.width > 0 && bounds.height > 0) {
        doneRef.current = true;
        // Allow the initial fit to zoom out far enough to show the whole graph (big graphs go below
        // MIN_ZOOM); small graphs stay capped so a couple of nodes aren't blown up.
        fitView({ padding: 0.2, minZoom: fitMinZoom(bounds.width, bounds.height, width, height), maxZoom: 1 });
        return;
      }
      tries += 1;
      if (tries < 60) {
        raf = requestAnimationFrame(place);
      }
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [nodeCount, storeApi, getNodes, getNodesBounds, fitView]);
  return null;
}

// Keeps the interactive zoom-out floor in sync with the graph size: a big graph can be zoomed out
// until the whole thing fits (see fitMinZoom); a normal graph keeps MIN_ZOOM. Recomputes when the
// graph or the pane resizes. Lives inside the provider for the pane dimensions.
function MinZoomController({
  graphWidth,
  graphHeight,
  onChange,
}: {
  graphWidth: number;
  graphHeight: number;
  onChange: (minZoom: number) => void;
}) {
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);
  useEffect(() => {
    if (paneWidth > 0 && paneHeight > 0) {
      onChange(fitMinZoom(graphWidth, graphHeight, paneWidth, paneHeight));
    }
  }, [graphWidth, graphHeight, paneWidth, paneHeight, onChange]);
  return null;
}

// Recenters the viewport on a node when asked (command-palette "go to"). Keyed by a token so
// re-picking the same node pans again. Lives inside the ReactFlowProvider for useReactFlow.
function FocusNode({ nodeId, token }: { nodeId?: string; token?: number }) {
  const { getNodesBounds, setCenter, getZoom } = useReactFlow();
  // biome-ignore lint/correctness/useExhaustiveDependencies: token is the intentional re-trigger so re-picking the same node pans again.
  useEffect(() => {
    if (!nodeId) {
      return;
    }
    const bounds = getNodesBounds([nodeId]);
    if (!bounds || bounds.width === 0) {
      return;
    }
    // Keep the current zoom (clamped to a readable band) so jumping doesn't lurch the scale.
    const zoom = Math.min(Math.max(getZoom(), 0.8), 1);
    // Ease over ~600ms so the pan reads as a deliberate glide, not an instant jump.
    setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { duration: animMs(600), zoom });
  }, [nodeId, token, getNodesBounds, setCenter, getZoom]);
  return null;
}

// Keeps the selected node visible when the inspector rail opens. The rail is a flex sibling stealing
// ~384px on the right, hiding a node near the right edge. Once its open animation settles (pane stops
// resizing), nudge the viewport just enough to reveal the node, only if clipped. The minimal dx stays
// inside `translateExtent`, so no clamping is needed.
function KeepSelectionInView({ selectedNodeId, focusToken }: { selectedNodeId?: string; focusToken?: number }) {
  const { getNodesBounds, getViewport, setViewport } = useReactFlow();
  // Re-runs as the canvas resizes during the rail animation; each change resets the settle
  // timer, so the nudge fires once the pane width finally stops changing.
  const paneWidth = useStore((s) => s.width);
  // A palette "go to" centers the node via FocusNode; skip this nudge for that cycle so the two
  // don't issue competing pans.
  const lastFocusToken = useRef(focusToken);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    if (focusToken !== lastFocusToken.current) {
      lastFocusToken.current = focusToken;
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
        setViewport({ x: x + dx, y, zoom }, { duration: animMs(200) });
      }
    }, RAIL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [selectedNodeId, paneWidth, focusToken, getNodesBounds, getViewport, setViewport]);

  return null;
}

// Padding (px) between a construct's members and the region edge. Tight and EQUAL on all sides so a
// box hugs its own nodes symmetrically. The label sits just ABOVE the top border (not in an internal
// band), so the top gap can match the others.
const SCOPE_REGION_PAD = 6;
const SCOPE_REGION_TOP_PAD = 6;
// Extra padding per level of boxes nested INSIDE a region, so an outer region stands off from the
// inner ones it contains (else nested boxes sharing an extreme member draw flush).
const SCOPE_REGION_NEST_STEP = 4;

// Accent colour for a construct's scope region: red for error/dead-letter (catch), else the role accent.
function constructAccent(node?: Node): string {
  const d = node?.data as FlowCardData | undefined;
  if (d?.isErrorPath) {
    return 'var(--color-destructive)';
  }
  return sectionAccent(d?.section) ?? 'var(--color-primary)';
}

type ScopeBounds = { minX: number; minY: number; maxX: number; maxY: number };

// Center-x gap that starts a new column. Dagre gives every node in a rank the same center-x, and
// adjacent ranks sit far wider apart than this, so it cleanly buckets members by rank/column.
const SCOPE_COLUMN_GAP = 80;

// A scope's footprint as ONE box PER COLUMN (Dagre rank) rather than a single bounding box.
// A construct's members can form an L — a fan marker on the left, its outputs a column to the
// right — whose overall bounding box swallows an unrelated sibling card in the empty corner. A
// per-column footprint hugs the members in each column instead, so it never covers a card that
// isn't a member. Prefers each node's MEASURED size (so a slab hugs the rendered card, not the
// layout's over-reserved estimate); falls back to the layout size before measurement.
export function scopeColumnSlabs(
  nodes: Node[],
  scope: ReadonlySet<string>,
  measuredById: Map<string, { measured?: { width?: number; height?: number } }>
): ScopeBounds[] {
  const rects: { cx: number; bounds: ScopeBounds }[] = [];
  for (const n of nodes) {
    if (!nodeInScope(n, scope)) {
      continue;
    }
    const m = measuredById.get(n.id)?.measured;
    const w = (m?.width ?? n.initialWidth ?? n.width ?? 0) as number;
    const h = (m?.height ?? n.initialHeight ?? n.height ?? 0) as number;
    rects.push({
      cx: n.position.x + w / 2,
      bounds: { minX: n.position.x, minY: n.position.y, maxX: n.position.x + w, maxY: n.position.y + h },
    });
  }
  rects.sort((a, z) => a.cx - z.cx);
  const slabs: ScopeBounds[] = [];
  let curCx = Number.NEGATIVE_INFINITY;
  for (const { cx, bounds } of rects) {
    const slab = slabs.at(-1);
    if (slab && cx - curCx <= SCOPE_COLUMN_GAP) {
      slab.minX = Math.min(slab.minX, bounds.minX);
      slab.minY = Math.min(slab.minY, bounds.minY);
      slab.maxX = Math.max(slab.maxX, bounds.maxX);
      slab.maxY = Math.max(slab.maxY, bounds.maxY);
    } else {
      slabs.push({ ...bounds });
    }
    curCx = cx;
  }
  return slabs;
}

type ScopeRegion = {
  id: string;
  scope: ReadonlySet<string>;
  // One box per column the construct occupies (see scopeColumnSlabs).
  slabs: ScopeBounds[];
  accent: string;
  label: string;
  /** Side / top padding — larger for outer regions so nested ones don't touch. */
  pad: number;
  topPad: number;
};

// The slab that hosts the region's label — the top-left-most column, so the label sits where
// the construct starts.
function labelSlabIndex(slabs: ScopeBounds[]): number {
  let best = 0;
  for (let i = 1; i < slabs.length; i += 1) {
    const s = slabs[i];
    const b = slabs[best];
    if (s.minX < b.minX || (s.minX === b.minX && s.minY < b.minY)) {
      best = i;
    }
  }
  return best;
}

// One construct's enclosure — a faint dashed box PER COLUMN it occupies (so an L-shaped construct
// hugs its members instead of one big box swallowing a sibling in the corner). Drawn FAINT (a quiet
// nesting hint); the boxes and label strengthen when the construct, or anything inside it, is the
// active (selected/hovered) node. Non-interactive, behind the nodes, in flow coordinates.
function RegionBox({ region, active }: { region: ScopeRegion; active: boolean }) {
  const { slabs, accent, label, pad, topPad } = region;
  const labelIdx = labelSlabIndex(slabs);
  const borderColor = `color-mix(in srgb, ${accent} ${active ? 70 : 32}%, transparent)`;
  const backgroundColor = `color-mix(in srgb, ${accent} ${active ? 10 : 5}%, transparent)`;
  return (
    <>
      {slabs.map((bounds, i) => (
        <div
          className="pointer-events-none absolute rounded-xl border border-dashed transition-[background-color,border-color] duration-200"
          key={`${bounds.minX}-${bounds.minY}`}
          style={{
            transform: `translate(${bounds.minX - pad}px, ${bounds.minY - topPad}px)`,
            width: bounds.maxX - bounds.minX + 2 * pad,
            height: bounds.maxY - bounds.minY + topPad + pad,
            borderColor,
            backgroundColor,
            zIndex: 0,
          }}
        >
          {/* Label sits just above the top border of the construct's first column. Faint until active. */}
          {i === labelIdx ? (
            <span
              className="absolute bottom-full left-2 mb-0.5 rounded px-1.5 py-0.5 font-semibold text-[10px] uppercase tracking-wide transition-opacity duration-200"
              style={{
                color: accent,
                opacity: active ? 1 : 0.8,
                backgroundColor: 'var(--color-background)',
                border: `1px solid color-mix(in srgb, ${accent} ${active ? 55 : 32}%, transparent)`,
              }}
            >
              {label}
            </span>
          ) : null}
        </div>
      ))}
    </>
  );
}

// Faint enclosure boxes around every control-flow construct's sub-graph, emphasized when the
// construct (or anything inside) is selected/hovered. Drawn via `ViewportPortal` (flow coords),
// behind the nodes, non-interactive — never perturbs the nodes array (hover stays cheap). Every
// construct gets a box (Dagre can scatter members so a box may span a non-member card — accepted
// for always-visible scopes).
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
  // Measured sizes live on the store's stably-mutated nodeLookup, so subscribing to it alone won't
  // re-render. `measuredKey` is a primitive digest that changes when cards measure, re-rendering +
  // recomputing the memo so boxes tighten from the layout estimate to the rendered size.
  const nodeLookup = useStore((s) => s.nodeLookup);
  const measuredKey = useStore((s) => {
    // Numeric digest of measured sizes — no per-frame string allocation (this selector re-runs on every
    // store change, incl. every pan/zoom frame). Folds width + height so a reflow at constant height
    // still retriggers the geometry memo.
    let h = 0;
    for (const n of s.nodeLookup.values()) {
      h = (h * 31 + Math.round(n.measured?.width ?? 0)) % 2_147_483_647;
      h = (h * 31 + Math.round(n.measured?.height ?? 0)) % 2_147_483_647;
    }
    return h;
  });
  // Geometry depends only on the layout + measurements, so cache it across hover/selection changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measuredKey re-triggers bounds when cards measure.
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
      const slabs = scopeColumnSlabs(rfNodes, scope, nodeLookup);
      if (slabs.length === 0) {
        continue;
      }
      drafts.push({
        id: node.id,
        scope,
        slabs,
        accent: constructAccent(node),
        label: (node.data as FlowCardData).label,
      });
    }
    // How many OTHER regions enclose each (its construct id is in their scope).
    const depthOf = (r: Draft) => drafts.filter((o) => o.id !== r.id && o.scope.has(r.id)).length;
    const depths = drafts.map(depthOf);
    // Standoff scales with how deeply a region's OWN contents nest (0 if it holds no inner boxes), so
    // each enclosing box stands one step off the inner ones; a construct with nothing nested hugs its
    // nodes tightly regardless of nesting elsewhere.
    const innerDepth = (i: number) =>
      drafts.reduce((h, o, j) => (j !== i && drafts[i].scope.has(o.id) ? Math.max(h, depths[j] - depths[i]) : h), 0);
    return drafts.map((r, i) => {
      const extra = innerDepth(i) * SCOPE_REGION_NEST_STEP;
      return { ...r, pad: SCOPE_REGION_PAD + extra, topPad: SCOPE_REGION_TOP_PAD + extra };
    });
  }, [rfNodes, scopeOf, nodeLookup, measuredKey]);

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
  /** Node ids whose config differs from the last-saved pipeline. */
  unsavedNodeIds?: ReadonlySet<string>;
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
  // A processor-switch case's condition edit is attributed to its (non-rendered) case-wrapper node,
  // so also mark the entry card standing in for that wrapper.
  if (cb.unsavedNodeIds?.has(node.id) || (data.caseOwnerId && cb.unsavedNodeIds?.has(data.caseOwnerId))) {
    data.unsaved = true;
  }
  if (cb.flashNodeIds?.has(node.id)) {
    data.flash = true;
    data.flashToken = cb.flashToken;
  }
  wireNodeActions(data, node, cb);
  // A node new this render (e.g. revealed by expanding its container) appears in place, not sliding
  // from origin: drop the transform transition so it snaps, and let the card fade + grow in (`appeared`).
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

// A filled chip swatch for node-borne vocabulary (the amber/gold routing condition), vs. edge line swatches.
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

// Reference edges are context lines (dashed, muted), so they never fully dim — they stay at the
// readable "faint" tier even when an unrelated node is selected. An active endpoint highlights them.
function decorateReferenceEdge(edge: Edge, activeScope: ReadonlySet<string> | undefined): Edge {
  const touchesActive = activeScope !== undefined && (activeScope.has(edge.source) || activeScope.has(edge.target));
  return { ...edge, data: { ...edge.data, emphasized: touchesActive, faint: !touchesActive } };
}

// Per-render edge styling: reference edges stay faint until an endpoint is active; a selection
// emphasizes its own edges (incl. inside a selected container) and dims the rest; graph edges get
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
    if (onInsert && next.type === 'flowGraphEdge' && insertIndex !== undefined) {
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
      return { ...next, data: { ...next.data, dimmed: !touchesSelection, emphasized: touchesSelection } };
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
  /** Currently selected node id (highlighted on the canvas). */
  selectedNodeId?: string;
  /** Kind of the selected edit target — `'switchCase'` highlights the condition, not the card. */
  selectedTargetKind?: string;
  /** Lint messages mapped to node ids — badged in place on the canvas. */
  lintErrorsByNode?: Map<string, string[]>;
  /** Node ids whose config differs from the last-saved pipeline — flagged with an unsaved dot. */
  unsavedNodeIds?: ReadonlySet<string>;
  /** Node ids to briefly pulse (e.g. after undo/redo), with a token to replay it. */
  flashNodeIds?: ReadonlySet<string>;
  flashToken?: number;
  /** Node id to recenter the viewport on (e.g. picked from the command palette); the token
      re-triggers the pan even when the same node is chosen twice. */
  focusNodeId?: string;
  focusToken?: number;
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
  selectedNodeId,
  selectedTargetKind,
  lintErrorsByNode,
  unsavedNodeIds,
  flashNodeIds,
  flashToken,
  focusNodeId,
  focusToken,
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
  // The armed zoom tool (Z / Option+Z) — drives the magnifier cursor and click-to-zoom.
  const [zoomMode, setZoomMode] = useState<ZoomMode>(null);
  // Interactive zoom-out floor — lowered for graphs too big to fit at MIN_ZOOM (MinZoomController).
  const [minZoom, setMinZoom] = useState(MIN_ZOOM);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useZoomCursor(zoomMode, wrapperRef);
  // Node ids committed last render; anything new this render "appears" in place and skips the
  // reposition transition (so it doesn't fly from origin).
  const previousIdsRef = useRef<ReadonlySet<string>>(new Set());
  const debouncedYaml = useDebouncedValue(configYaml, PARSE_DEBOUNCE_MS);
  const { nodes, error, showingStale } = useResilientParse(debouncedYaml);

  // A node's "scope" — itself plus all descendants — so selecting/hovering a container keeps its
  // internal wiring (chains, fan/merge edges) lit and focuses its branch.
  const childrenByParent = useMemo(() => {
    const map = new Map<string | undefined, string[]>();
    for (const node of nodes) {
      const siblings = map.get(node.parentId);
      if (siblings) {
        siblings.push(node.id);
      } else {
        map.set(node.parentId, [node.id]);
      }
    }
    return map;
  }, [nodes]);
  const scopeOf = useCallback(
    (id: string | undefined): ReadonlySet<string> | undefined => {
      if (id === undefined) {
        return;
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
    [childrenByParent]
  );

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

  // Edit mode (nested inserts wired) shows the ghost "add" branches; read-only hides them.
  // Derived OUTSIDE the layout memo so the memo keys on the stable boolean, not the callback's
  // identity — an ancestor re-creating onSlotInsert must not re-run the Dagre pass.
  const editable = Boolean(onSlotInsert);

  // Expensive layout memo: the full Dagre pass plus everything derived purely from its geometry
  // (pan extent, legend). Keyed ONLY on the parsed nodes + edit mode, so selection / lint / flash /
  // unsaved decoration changes (every click) never re-run layout.
  const { layoutNodes, layoutEdges, translateExtent, contentWidth, contentHeight, legend } = useMemo(() => {
    const layout = computeGraphLayout(nodes, editable);

    // Allow panning a margin past the content (measured, since resources sit at negative x) so
    // an edge node can reach the middle.
    const margin = PAN_PADDING;
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
      layoutNodes: layout.rfNodes,
      layoutEdges: layout.rfEdges,
      translateExtent: extent,
      contentWidth: bounds.maxX - bounds.minX,
      contentHeight: bounds.maxY - bounds.minY,
      legend: legendFlags,
    };
  }, [nodes, editable]);

  // Cheap decoration memo over the laid-out nodes: inject per-node selection/lint/flash data, then
  // fade nodes outside a selected construct's scope (focusDimNodes). Keyed on the decoration inputs
  // only — a click re-runs this, never the Dagre layout above. Hover is excluded, so it stays off
  // the cheap-hover (edges-only) path.
  const rfNodes = useMemo(() => {
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
      unsavedNodeIds,
      flashNodeIds,
      flashToken,
      previousIds: previousIdsRef.current,
    };
    return focusDimNodes(
      layoutNodes.map((node: Node) => injectNodeData(node, callbacks)),
      selectedNodeId,
      scopeOf
    );
  }, [
    layoutNodes,
    collapsedIds,
    toggleCollapse,
    selectedNodeId,
    selectedTargetKind,
    lintErrorsByNode,
    unsavedNodeIds,
    flashNodeIds,
    flashToken,
    onAddConnector,
    onAddTopic,
    onAddSasl,
    onSlotInsert,
    onSelectNode,
    scopeOf,
  ]);

  // Record the committed node ids so the next render can tell which nodes are new.
  useEffect(() => {
    previousIdsRef.current = new Set(rfNodes.map((node) => node.id));
  }, [rfNodes]);

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
        {/* A persistent parse error with NO last-good graph: the banner must stay (no dismiss) —
            dismissing it left an unexplained frozen skeleton — and the copy points at the fix. */}
        {error ? (
          <Banner height="2rem" variant="accent">
            <BannerContent>Unable to visualize this pipeline — fix the YAML in the YAML tab.</BannerContent>
          </Banner>
        ) : null}
        {/* Freeze the skeleton under an error (it's a backdrop, not a loading state). */}
        <div className={error ? 'opacity-40 **:animate-none!' : undefined}>
          <PipelineFlowSkeleton />
        </div>
      </div>
    );
  }

  return (
    // Compact lane: canvas is exactly as tall as its content and top-anchored, so it never
    // re-centers as the lane resizes — the surrounding lane scrolls.
    <div className="relative w-full" ref={wrapperRef} style={{ height: '100%' }}>
      <StaleParseBanner show={showingStale} />
      <ReactFlowProvider>
        <ReactFlow
          className={staleFlowClass(showingStale)}
          edges={rfEdges}
          edgeTypes={flowEdgeTypes}
          elementsSelectable={false}
          maxZoom={MAX_ZOOM}
          minZoom={minZoom}
          nodes={rfNodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          nodeTypes={flowNodeTypes}
          onNodeClick={(_, node) => {
            // Structural sub-nodes have no editTarget — clicking selects the nearest
            // selectable ancestor (see selectionTargetForNode).
            const selection = selectionTargetForNode(node, rfNodes);
            if (selection) {
              onSelectNode?.(selection.id, selection.target, selection.caseTarget);
            }
          }}
          onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
          // Only clear when leaving the tracked node: crossing into a nested child fires
          // enter(child) then leave(parent), which must not wipe the child's hover.
          onNodeMouseLeave={(_, node) => setHoveredNodeId((prev) => (prev === node.id ? undefined : prev))}
          onPaneClick={() => onClearSelection?.()}
          panOnDrag={canPanCanvas(zoomMode)}
          panOnScroll={false}
          // The wheel scrolls the embedded page (the canvas is full-height); zoom is on the Z / Option+Z
          // keys (see ZoomTool), the Controls buttons, and trackpad pinch.
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          translateExtent={translateExtent}
          zoomOnDoubleClick
          zoomOnPinch
          zoomOnScroll={false}
        >
          {/* Faint plus-mark texture so the canvas doesn't read as blank. A partly-transparent border
              tone (theme-aware) with small, sparse marks — a background hint, not a grid. */}
          <Background
            color="color-mix(in srgb, var(--color-border) 30%, transparent)"
            gap={28}
            size={4}
            variant={BackgroundVariant.Cross}
          />
          <Controls
            className="overflow-hidden rounded-md border border-border bg-background/90 shadow-sm backdrop-blur-sm"
            position="bottom-right"
            showInteractive={false}
          />
          <PipelineMiniMap nodes={rfNodes} translateExtent={translateExtent} />
          {/* Renders only for control-flow markers (flowSplit/flowMerge). */}
          <ScopeRegions hoveredId={hoveredNodeId} rfNodes={rfNodes} scopeOf={scopeOf} selectedId={selectedNodeId} />
          <FitOnInit />
          <MinZoomController graphHeight={contentHeight} graphWidth={contentWidth} onChange={setMinZoom} />
          <KeepSelectionInView focusToken={focusToken} selectedNodeId={selectedNodeId} />
          <FocusNode nodeId={focusNodeId} token={focusToken} />
          <ZoomTool minZoom={minZoom} mode={zoomMode} setMode={setZoomMode} />
        </ReactFlow>
      </ReactFlowProvider>
      <FlowLegend flags={legend} />
    </div>
  );
}
