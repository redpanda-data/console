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
import { useDebouncedValue } from 'hooks/use-debounced-value';
import {
  memo,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { InvalidConfigNotice } from './invalid-config-notice';
import type { FlowCardData } from './pipeline-flow-canvas-nodes';
import { flowEdgeTypes, flowNodeTypes, sectionAccent } from './pipeline-flow-canvas-nodes';
import { PipelineFlowSkeleton } from './pipeline-flow-skeleton';
import { useResilientParse } from './use-resilient-parse';
import { computeGraphLayout, type FlowInsertPayload } from '../utils/pipeline-flow-layout';
import { buildChildrenMap } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const PARSE_DEBOUNCE_MS = 300;
// How far past the diagram the canvas may be panned, so an edge node can be brought to the middle.
const PAN_PADDING = 240;

// RF's pan/zoom eases are d3-driven (JS), beyond the CSS reduced-motion rule — collapse them to instant.
const animMs = (ms: number): number =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.25;
// Floor for graphs too big to fit even at MIN_ZOOM — never below this, so it can't zoom out to a dot.
const ABSOLUTE_MIN_ZOOM = 0.05;

// Zoom-out floor: MIN_ZOOM normally, down to ABSOLUTE_MIN_ZOOM when the graph is too big to fit.
function fitMinZoom(graphW: number, graphH: number, paneW: number, paneH: number): number {
  if (graphW <= 0 || graphH <= 0 || paneW <= 0 || paneH <= 0) {
    return MIN_ZOOM;
  }
  // 0.9 leaves a little margin around the fully-zoomed-out graph.
  const fit = 0.9 * Math.min(paneW / graphW, paneH / graphH);
  return Math.min(MIN_ZOOM, Math.max(ABSOLUTE_MIN_ZOOM, fit));
}

// Bounding box of top-level nodes; measured (not assumed from origin) since resource cards can sit at negative x.
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
// Fixed width; height tracks the diagram's aspect (clamped) so there's no unreachable letterbox space.
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

// Overview minimap; draws only the pan-reachable world (see `world`). Click/drag re-centres.
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

  // The SAME `translateExtent` passed to <ReactFlow>, so the minimap agrees with the canvas on reach.
  const ext = useMemo(
    () => ({
      minX: translateExtent[0][0],
      minY: translateExtent[0][1],
      maxX: translateExtent[1][0],
      maxY: translateExtent[1][1],
    }),
    [translateExtent]
  );

  // Per axis: viewport smaller than extent → whole extent is reachable, show it; else the axis is
  // locked, so show the live visible window (RF pins an oversized viewport to an edge).
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

  // Each axis scales independently so a clamp-forced aspect mismatch can't leave dead bands.
  const innerW = mapW - 2 * MINIMAP_PAD;
  const innerH = clampValue(innerW * (worldH / worldW), MINIMAP_MIN_INNER_H, MINIMAP_MAX_INNER_H);
  const mapH = innerH + 2 * MINIMAP_PAD;
  const scaleX = innerW / worldW;
  const scaleY = innerH / worldH;
  const offsetX = MINIMAP_PAD - world.minX * scaleX;
  const offsetY = MINIMAP_PAD - world.minY * scaleY;

  // The world always contains the viewport, so the rect needs no clamping; on a locked axis it fills edge-to-edge.
  const view = { x: viewLeft * scaleX + offsetX, y: viewTop * scaleY + offsetY, w: vw * scaleX, h: vh * scaleY };

  const panToEvent = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left - offsetX) / scaleX;
    const fy = (e.clientY - rect.top - offsetY) / scaleY;
    // Clamp the target centre to the drag extent; lock to the extent centre on an axis too small to pan.
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
        onPointerCancel={() => {
          // An interrupted drag never fires pointerup — clear the flag so moves stop re-centering.
          draggingRef.current = false;
        }}
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

// Reveal margin (px), and how long to wait for the inspector rail's open animation before measuring.
const SELECTION_REVEAL_MARGIN = 32;
const RAIL_SETTLE_MS = 240;

// In scope if it's a member by id, or carries the construct's id as `ownerId` (marks outside the parser tree).
function nodeInScope(node: Node, scope: ReadonlySet<string>): boolean {
  return scope.has(node.id) || scope.has((node.data as FlowCardData).ownerId ?? ' ');
}

// Selecting a control-flow construct focuses its branch: nodes outside its scope fade back so its members read clearly.
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
  return rfNodes.map((node) =>
    nodeInScope(node, focus)
      ? node
      : {
          ...node,
          style: { ...(node.style as Record<string, unknown>), opacity: 0.3, transition: 'opacity 200ms ease' },
        }
  );
}

// The graph fades back while it's showing the stale (last-good) layout, cueing that it's not live.
const staleFlowClass = (stale: boolean): string => `transition-opacity duration-200 ${stale ? 'opacity-60' : ''}`;

const CANVAS_NOTICE_CLASS =
  'absolute top-3 left-1/2 z-20 -translate-x-1/2 px-3 py-1.5 text-sm shadow-sm backdrop-blur-sm';

// Banner shown while rendering the last-good graph for invalid YAML (see useResilientParse).
function StaleParseBanner({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return (
    <InvalidConfigNotice className={CANVAS_NOTICE_CLASS}>
      Can&apos;t visualize the latest YAML — showing the last valid layout.
    </InvalidConfigNotice>
  );
}

// The zoom tool's armed state: a magnifier-`+` (zoom in) or `-` (zoom out) cursor, or off.
type ZoomMode = 'in' | 'out' | null;
const ZOOM_STEP = 1.5;

function cursorForMode(mode: ZoomMode): string {
  return mode === 'in' ? 'zoom-in' : mode === 'out' ? 'zoom-out' : '';
}

// Paint the magnifier cursor while the zoom tool is armed. Set inline on the container AND its pane:
// RF styles the pane cursor itself, so a Tailwind class loses but an inline style wins.
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

// Free-pan is suppressed while the zoom tool is armed — else a pan-drag ends in a click that zooms.
const canPanCanvas = (mode: ZoomMode): boolean => mode === null;

// Spring-loaded: held Z → zoom-in, held Z + Option/Alt → zoom-out, nothing held → off.
function heldZoomMode(zDown: boolean, alt: boolean): ZoomMode {
  return zDown ? (alt ? 'out' : 'in') : null;
}

const isTypingTarget = (target: EventTarget | null): boolean =>
  Boolean((target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"], .monaco-editor'));

// Figma-style hold-to-activate zoom: while Z is held a click zooms toward the pointer (Option/Alt to
// zoom out); releasing returns to pan/select. The wheel is left to the page. Ignored while typing.
function ZoomTool({ mode, setMode, minZoom }: { mode: ZoomMode; setMode: (next: ZoomMode) => void; minZoom: number }) {
  const { screenToFlowPosition, getZoom, setCenter } = useReactFlow();

  // Track key-hold state via keydown/keyup, plus blur so a release missed while unfocused can't leave the tool stuck on.
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

// Frame the graph on first load: centered and zoomed to fit. Retries each frame until pane size and
// node bounds are real, so it fires ASAP rather than waiting for a later resize (a visible "snap").
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
        // Big graphs may fit below MIN_ZOOM; small graphs stay capped so a few nodes aren't blown up.
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

// Keeps the zoom-out floor in sync with graph size (see fitMinZoom); inside the provider for pane size.
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

// Recenters the viewport on a node (command-palette "go to"). Keyed by a token so re-picking the same node pans again.
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
    // Long ease so the pan reads as a glide, not a jump.
    setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { duration: animMs(600), zoom });
  }, [nodeId, token, getNodesBounds, setCenter, getZoom]);
  return null;
}

// Keeps the selected node visible when the inspector rail opens (a flex sibling stealing ~384px on
// the right). Once its open animation settles, nudge the viewport just enough to reveal a clipped node.
function KeepSelectionInView({ selectedNodeId, focusToken }: { selectedNodeId?: string; focusToken?: number }) {
  const { getNodesBounds, getViewport, setViewport } = useReactFlow();
  // Pane-width changes reset the settle timer, so the nudge fires once the rail stops resizing the canvas.
  const paneWidth = useStore((s) => s.width);
  // A palette "go to" centers via FocusNode; skip this nudge that cycle so the two don't compete.
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

// Padding (px) between a construct's members and the region edge; extra per nesting level so outer regions stand off.
const SCOPE_REGION_PAD = 6;
const SCOPE_REGION_TOP_PAD = 6;
const SCOPE_REGION_NEST_STEP = 4;

// The accent for a construct node; error/dead-letter paths (catch) get a distinct tone.
function constructAccent(node?: Node): string {
  const d = node?.data as FlowCardData | undefined;
  return d?.isErrorPath ? 'var(--color-destructive)' : (sectionAccent(d?.section) ?? 'var(--color-primary)');
}

type ScopeBounds = { minX: number; minY: number; maxX: number; maxY: number };
type Point = { x: number; y: number };
type MeasuredById = Map<string, { measured?: { width?: number; height?: number } }>;
// One rectangle over the `body` members; the `entry` marker sits outside, reached by an arm (see regionGeometry).
type ScopeGeometry = { body: ScopeBounds; entry: ScopeBounds | null };

function nodeRect(n: Node, measuredById: MeasuredById): ScopeBounds {
  const m = measuredById.get(n.id)?.measured;
  const w = (m?.width ?? n.initialWidth ?? n.width ?? 0) as number;
  const h = (m?.height ?? n.initialHeight ?? n.height ?? 0) as number;
  return { minX: n.position.x, minY: n.position.y, maxX: n.position.x + w, maxY: n.position.y + h };
}

const growBounds = (box: ScopeBounds | null, r: ScopeBounds): ScopeBounds =>
  box
    ? {
        minX: Math.min(box.minX, r.minX),
        minY: Math.min(box.minY, r.minY),
        maxX: Math.max(box.maxX, r.maxX),
        maxY: Math.max(box.maxY, r.maxY),
      }
    : r;

// Split a construct's scoped members into the body (everything but the entry marker) and the entry
// marker's own rect. Prefers measured size, falling back to layout size. Null when there's no body.
export function scopeBounds(
  nodes: Node[],
  scope: ReadonlySet<string>,
  measuredById: MeasuredById,
  isEntry?: (n: Node) => boolean
): ScopeGeometry | null {
  let body: ScopeBounds | null = null;
  let entry: ScopeBounds | null = null;
  for (const n of nodes) {
    if (!nodeInScope(n, scope)) {
      continue;
    }
    const r = nodeRect(n, measuredById);
    if (isEntry?.(n)) {
      entry = r;
    } else {
      body = growBounds(body, r);
    }
  }
  return body ? { body, entry } : null;
}

type ScopeRegion = {
  id: string;
  scope: ReadonlySet<string>;
  body: ScopeBounds;
  entry: ScopeBounds | null;
  accent: string;
  label: string;
  /** Side / top padding — larger for outer regions so nested ones don't touch. */
  pad: number;
  topPad: number;
};

// Browsers silently drop a filled div's background past ~8k–16k device px, so tall region fills are
// painted as stacked pieces capped at this. Exported so the render test can assert the cap.
export const MAX_REGION_PIECE_PX = 3000;

type RegionGeometry = {
  /** Padded body rect + optional arm rect, painted as the fill (sliced by MAX_REGION_PIECE_PX). */
  rects: ScopeBounds[];
  /** Dashed outline path in bbox-local coords: the body rectangle with an arm out to the entry. */
  path: string;
  bbox: { x: number; y: number; w: number; h: number };
  /** Body's top-left corner, where the label sits. */
  anchor: Point;
};

// A thin arm from the body edge out to the entry marker, at the marker's row.
type ScopeArm = { side: 'left' | 'right'; outerX: number; top: number; bottom: number };

// Which side of the body the entry marker sits on (undefined if it overlaps the body horizontally).
function entrySide(entry: ScopeBounds, body: ScopeBounds): 'left' | 'right' | undefined {
  return entry.maxX <= body.minX ? 'left' : entry.minX >= body.maxX ? 'right' : undefined;
}

// The arm to the entry marker at its own row: stretched to meet the body when the marker sits clear
// above/below it; otherwise clamped to the body so it stays thin and can't reach into a sibling.
function entryArm(entry: ScopeBounds, body: ScopeBounds, pb: ScopeBounds, pad: number): ScopeArm | undefined {
  const side = entrySide(entry, body);
  if (!side) {
    return;
  }
  let top = entry.minY - pad;
  let bottom = entry.maxY + pad;
  if (bottom < pb.minY) {
    bottom = pb.minY;
  } else if (top > pb.maxY) {
    top = pb.maxY;
  } else {
    top = Math.max(top, pb.minY);
    bottom = Math.min(bottom, pb.maxY);
  }
  return bottom > top
    ? { side, outerX: side === 'left' ? entry.minX - pad : entry.maxX + pad, top, bottom }
    : undefined;
}

// The body rectangle traced clockwise, poking the arm out at the entry marker's row.
function regionPath(pb: ScopeBounds, arm?: ScopeArm): Point[] {
  const pts: Point[] = [
    { x: pb.minX, y: pb.minY },
    { x: pb.maxX, y: pb.minY },
  ];
  if (arm?.side === 'right') {
    pts.push(
      { x: pb.maxX, y: arm.top },
      { x: arm.outerX, y: arm.top },
      { x: arm.outerX, y: arm.bottom },
      { x: pb.maxX, y: arm.bottom }
    );
  }
  pts.push({ x: pb.maxX, y: pb.maxY }, { x: pb.minX, y: pb.maxY });
  if (arm?.side === 'left') {
    pts.push(
      { x: pb.minX, y: arm.bottom },
      { x: arm.outerX, y: arm.bottom },
      { x: arm.outerX, y: arm.top },
      { x: pb.minX, y: arm.top }
    );
  }
  return pts;
}

// A padded body rectangle plus a thin arm out to the entry marker, so it reads as part of the area
// while the box stays clear of whatever shares the marker's column.
export function regionGeometry(
  body: ScopeBounds,
  entry: ScopeBounds | null,
  pad: number,
  topPad: number
): RegionGeometry {
  const pb = { minX: body.minX - pad, minY: body.minY - topPad, maxX: body.maxX + pad, maxY: body.maxY + pad };
  const arm = entry ? entryArm(entry, body, pb, pad) : undefined;
  const rects: ScopeBounds[] = [pb];
  if (arm) {
    rects.push(
      arm.side === 'left'
        ? { minX: arm.outerX, minY: arm.top, maxX: pb.minX, maxY: arm.bottom }
        : { minX: pb.maxX, minY: arm.top, maxX: arm.outerX, maxY: arm.bottom }
    );
  }
  let ox = pb.minX;
  let oy = pb.minY;
  let ox2 = pb.maxX;
  let oy2 = pb.maxY;
  for (const r of rects) {
    ox = Math.min(ox, r.minX);
    oy = Math.min(oy, r.minY);
    ox2 = Math.max(ox2, r.maxX);
    oy2 = Math.max(oy2, r.maxY);
  }
  const path = `M${regionPath(pb, arm)
    .map((p) => `${p.x - ox} ${p.y - oy}`)
    .join('L')}Z`;
  return { rects, path, bbox: { x: ox, y: oy, w: ox2 - ox, h: oy2 - oy }, anchor: { x: pb.minX, y: pb.minY } };
}

// One construct's enclosure: a faint dashed rect + arm to the entry marker; strengthens when the
// construct (or anything inside) is active. Non-interactive, behind the nodes, in flow coordinates.
const RegionBox = memo(({ region, active }: { region: ScopeRegion; active: boolean }) => {
  const { body, entry, accent, label, pad, topPad } = region;
  const borderColor = `color-mix(in srgb, ${accent} ${active ? 70 : 32}%, transparent)`;
  const backgroundColor = `color-mix(in srgb, ${accent} ${active ? 10 : 5}%, transparent)`;
  // Geometry is `active`-independent, so hover (colour only) doesn't recompute it.
  const { rects, path, bbox, anchor } = useMemo(
    () => regionGeometry(body, entry, pad, topPad),
    [body, entry, pad, topPad]
  );

  return (
    <>
      {/* Fill in height-capped pieces so a tall area never exceeds the browser paint limit (see MAX_REGION_PIECE_PX). */}
      {rects.flatMap((r) => {
        const width = r.maxX - r.minX;
        const height = r.maxY - r.minY;
        const pieceCount = Math.max(1, Math.ceil(height / MAX_REGION_PIECE_PX));
        const pieceHeight = height / pieceCount;
        return Array.from({ length: pieceCount }, (_, p) => {
          const topY = r.minY + p * pieceHeight;
          return (
            <div
              className="pointer-events-none absolute transition-[background-color] duration-200"
              data-region-fill="true"
              key={`${r.minX}-${topY}`}
              style={{
                transform: `translate(${r.minX}px, ${topY}px)`,
                width,
                height: pieceHeight,
                backgroundColor,
                zIndex: 0,
              }}
            />
          );
        });
      })}
      {/* Dashed border as one path — no per-piece seams. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute"
        height={bbox.h}
        style={{ transform: `translate(${bbox.x}px, ${bbox.y}px)`, overflow: 'visible', zIndex: 0 }}
        width={bbox.w}
      >
        <path
          d={path}
          fill="none"
          stroke={borderColor}
          strokeDasharray="4 4"
          strokeLinejoin="round"
          strokeWidth={1}
          style={{ transition: 'stroke 200ms' }}
        />
      </svg>
      <div className="pointer-events-none absolute" style={{ transform: `translate(${anchor.x}px, ${anchor.y}px)` }}>
        <span
          className="absolute bottom-full left-2 mb-0.5 rounded px-1.5 py-0.5 font-semibold text-2xs uppercase tracking-wide transition-opacity duration-200"
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
    </>
  );
});

type ScopeRegionDraft = Omit<ScopeRegion, 'pad' | 'topPad'>;
type RegionContext = {
  rfNodes: Node[];
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined;
  nodeLookup: MeasuredById;
  /** try marker id → its fused catch marker id, so a try's area also covers its error handling. */
  tryCatchPairs: ReadonlyMap<string, string>;
};

// One construct's region (before nesting padding). Only the entry marker is held outside (reached by
// an arm); everything else — branches, the merge/join, and a try's fused catch — is in the body.
function scopeRegionDraft(node: Node, ctx: RegionContext): ScopeRegionDraft | null {
  const { rfNodes, scopeOf, nodeLookup, tryCatchPairs } = ctx;
  const own = scopeOf(node.id);
  if (!own || own.size < 2) {
    return null;
  }
  const catchId = tryCatchPairs.get(node.id);
  const scope = catchId ? new Set([...own, ...(scopeOf(catchId) ?? [])]) : own;
  const geom = scopeBounds(rfNodes, scope, nodeLookup, (n) => n.id === node.id);
  if (!geom) {
    return null;
  }
  return {
    id: node.id,
    scope,
    body: geom.body,
    entry: geom.entry,
    accent: constructAccent(node),
    label: (node.data as FlowCardData).label,
  };
}

// Faint enclosure boxes around each construct's sub-graph, emphasized when it (or anything inside) is
// active. Drawn via `ViewportPortal` (hover stays cheap); a box may span a scattered non-member card.
function ScopeRegions({
  hoveredId,
  selectedId,
  rfNodes,
  scopeOf,
  tryCatchPairs,
}: {
  hoveredId?: string;
  selectedId?: string;
  rfNodes: Node[];
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined;
  tryCatchPairs: ReadonlyMap<string, string>;
}) {
  // The store's nodeLookup is stably mutated, so subscribing to it alone won't re-render;
  // `measuredKey` is a primitive digest that changes when cards measure, so boxes tighten to rendered sizes.
  const nodeLookup = useStore((s) => s.nodeLookup);
  // Only scoped cards affect region geometry, so the digest below covers just those — selector stays cheap.
  const scopedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of rfNodes) {
      if (node.type !== 'flowSplit') {
        continue;
      }
      const scope = scopeOf(node.id);
      if (scope) {
        for (const id of scope) {
          ids.add(id);
        }
      }
    }
    return ids;
  }, [rfNodes, scopeOf]);
  const measuredKey = useStore((s) => {
    // Integer digest of measured sizes (no per-frame string alloc); folds width+height so any reflow retriggers.
    let h = 0;
    for (const id of scopedIds) {
      const m = s.nodeLookup.get(id)?.measured;
      h = (h * 31 + Math.round(m?.width ?? 0)) % 2_147_483_647;
      h = (h * 31 + Math.round(m?.height ?? 0)) % 2_147_483_647;
    }
    return h;
  });
  // Geometry depends only on the layout + measurements, so cache it across hover/selection changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measuredKey re-triggers bounds when cards measure.
  const regions = useMemo<ScopeRegion[]>(() => {
    // A catch fused into a try is drawn as part of the try's area, not its own region.
    const absorbed = new Set(tryCatchPairs.values());
    const ctx: RegionContext = { rfNodes, scopeOf, nodeLookup, tryCatchPairs };
    const drafts = rfNodes
      .filter((n) => n.type === 'flowSplit' && !absorbed.has(n.id))
      .map((n) => scopeRegionDraft(n, ctx))
      .filter((d): d is ScopeRegionDraft => d !== null);
    // How many OTHER regions enclose each (its construct id is in their scope).
    const depthOf = (r: ScopeRegionDraft) => drafts.filter((o) => o.id !== r.id && o.scope.has(r.id)).length;
    const depths = drafts.map(depthOf);
    // Standoff scales with inner nesting depth (0 if none), so each enclosing box stands one step off the inner ones.
    const innerDepth = (i: number) =>
      drafts.reduce((h, o, j) => (j !== i && drafts[i].scope.has(o.id) ? Math.max(h, depths[j] - depths[i]) : h), 0);
    return drafts.map((r, i) => {
      const extra = innerDepth(i) * SCOPE_REGION_NEST_STEP;
      return { ...r, pad: SCOPE_REGION_PAD + extra, topPad: SCOPE_REGION_TOP_PAD + extra };
    });
  }, [rfNodes, scopeOf, nodeLookup, tryCatchPairs, measuredKey]);

  if (regions.length === 0) {
    return null;
  }
  // Emphasized when the active node is the construct or anywhere in its sub-graph (merge dots match via owner id).
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

// Edit-mode action callbacks wired onto a node's data.
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
    // The target kind picks whether to ring the condition row (case) or the whole card (component).
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
  // A condition edit is attributed to the non-rendered case-wrapper node — also mark its stand-in entry card.
  if (cb.unsavedNodeIds?.has(node.id) || (data.caseOwnerId && cb.unsavedNodeIds?.has(data.caseOwnerId))) {
    data.unsaved = true;
  }
  if (cb.flashNodeIds?.has(node.id)) {
    data.flash = true;
    data.flashToken = cb.flashToken;
  }
  wireNodeActions(data, node, cb);
  // New nodes appear in place: drop the transform transition so they snap, then fade + grow in (`appeared`).
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

// A filled chip swatch for node-borne vocabulary (routing condition), vs. edge line swatches.
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
      <div className="font-semibold text-2xs text-muted-foreground/70 uppercase tracking-wide">Legend</div>
      <div className="flex items-center gap-2">
        <LegendSwatch color="var(--color-primary)" />
        Data flow
      </div>
      {flags.condition ? (
        <div className="flex items-center gap-2">
          <LegendChipSwatch color="var(--color-warning)" />
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

// Reference edges are context lines: never below the "faint" tier, highlighted when an endpoint is active.
function decorateReferenceEdge(edge: Edge, activeScope: ReadonlySet<string> | undefined): Edge {
  const touchesActive = activeScope !== undefined && (activeScope.has(edge.source) || activeScope.has(edge.target));
  return { ...edge, data: { ...edge.data, emphasized: touchesActive, faint: !touchesActive } };
}

// Per-render edge styling: reference edges stay faint until an endpoint is active; a selection
// emphasizes its own edges and dims the rest; graph edges get their insert (+) handler.
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

// What a click selects: the node itself if editable, else the nearest selectable ancestor
// (structural sub-nodes like switch cases have no `editTarget`).
export function selectionTargetForNode(
  node: Node,
  nodes: Node[]
): { id: string; target: EditTarget; caseTarget?: EditTarget } | null {
  let current: Node | undefined = node;
  while (current && !(current.data as FlowCardData).editTarget) {
    // Nodes are positioned absolutely (no RF parentId), so walk the logical owner in `data.ownerId`.
    const ownerId: string | undefined = current.parentId ?? (current.data as FlowCardData).ownerId;
    current = ownerId ? nodes.find((n) => n.id === ownerId) : undefined;
  }
  const target = current && (current.data as FlowCardData).editTarget;
  if (!(current && target)) {
    return null;
  }
  // A case-entry node also carries its routing-condition target so the inspector can edit the condition too.
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
  // Node ids committed last render — anything new this render "appears" in place (see injectNodeData).
  const previousIdsRef = useRef<ReadonlySet<string>>(new Set());
  const debouncedYaml = useDebouncedValue(configYaml, PARSE_DEBOUNCE_MS);
  const { nodes, error, showingStale } = useResilientParse(debouncedYaml);

  // A node's "scope" — itself plus all descendants — so selecting/hovering a container lights its whole branch.
  const childrenByParent = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const scopeOf = useCallback(
    (id: string | undefined): ReadonlySet<string> | undefined => {
      if (id === undefined) {
        return;
      }
      const scope = new Set([id]);
      const queue = [id];
      while (queue.length > 0) {
        for (const child of childrenByParent.get(queue.pop() as string) ?? []) {
          scope.add(child.id);
          queue.push(child.id);
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

  // Layout keys on this stable boolean, not the callback identity — else an ancestor re-creating
  // onSlotInsert would re-run the Dagre pass.
  const editable = Boolean(onSlotInsert);

  // Expensive layout memo: the full Dagre pass plus everything derived from its geometry (pan
  // extent, legend). Keyed only on parsed nodes + edit mode, so decoration changes never re-run layout.
  const { layoutNodes, layoutEdges, translateExtent, contentWidth, contentHeight, legend } = useMemo(() => {
    const layout = computeGraphLayout(nodes, editable);

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

  // try marker → its fused catch marker (from the `error-<try>-<catch>` edge) so a try's region folds in its catch.
  const tryCatchPairs = useMemo(() => {
    const pairs = new Map<string, string>();
    for (const edge of layoutEdges) {
      if (edge.id.startsWith('error-')) {
        pairs.set(edge.source, edge.target);
      }
    }
    return pairs;
  }, [layoutEdges]);

  // Cheap decoration memo, keyed on decoration inputs only — a click re-runs this, not the Dagre
  // layout. Hover is excluded to stay on the cheap edges-only path.
  const rfNodes = useMemo(() => {
    const callbacks: CanvasCallbacks = {
      onAddConnector,
      onAddTopic,
      onAddSasl,
      onSlotInsert,
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
    scopeOf,
  ]);

  // Record the committed node ids so the next render can tell which nodes are new.
  useEffect(() => {
    previousIdsRef.current = new Set(rfNodes.map((node) => node.id));
  }, [rfNodes]);

  // Hover only restyles edges so node objects stay referentially stable — rebuilding the DOM under
  // the cursor looped mouseleave/mouseenter, flickering the cursor and eating clicks.
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
        {/* Parse error with no last-good graph: keep the notice up (no dismiss) and point at the fix. */}
        {error ? (
          <InvalidConfigNotice className={CANVAS_NOTICE_CLASS}>
            Unable to visualize this pipeline — fix the YAML in the YAML tab.
          </InvalidConfigNotice>
        ) : null}
        {/* Freeze the skeleton under an error (it's a backdrop, not a loading state). */}
        <div className={error ? 'opacity-40 **:animate-none!' : undefined}>
          <PipelineFlowSkeleton />
        </div>
      </div>
    );
  }

  return (
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
          // The wheel scrolls the embedded page; zoom is via Z / Option+Z (ZoomTool), the Controls, and pinch.
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          translateExtent={translateExtent}
          zoomOnDoubleClick
          zoomOnPinch
          zoomOnScroll={false}
        >
          {/* Faint plus-mark texture so the canvas doesn't read as blank — a background hint, not a grid. */}
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
          <ScopeRegions
            hoveredId={hoveredNodeId}
            rfNodes={rfNodes}
            scopeOf={scopeOf}
            selectedId={selectedNodeId}
            tryCatchPairs={tryCatchPairs}
          />
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
