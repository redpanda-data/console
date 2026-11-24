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
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useStoreApi,
  ViewportPortal,
} from '@xyflow/react';
import { useThemeAppearance } from 'hooks/use-theme-appearance';
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
import { toast } from 'sonner';

import { InvalidConfigNotice } from './invalid-config-notice';
import type { FlowCardData } from './pipeline-flow-canvas-nodes';
import { flowEdgeTypes, flowNodeTypes, sectionAccent } from './pipeline-flow-canvas-nodes';
import { PipelineFlowSkeleton } from './pipeline-flow-skeleton';
import { useResilientParse } from './use-resilient-parse';
import { computeGraphLayout, type FlowInsertPayload } from '../utils/pipeline-flow-layout';
import { buildChildrenMap, type PipelineFlowNode } from '../utils/pipeline-flow-parser';
import type { StopConditionDraft } from '../utils/read-until';
import type { EditTarget } from '../utils/yaml';

const PARSE_DEBOUNCE_MS = 300;

function useLeadingDebouncedValue<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value);
  const lastAppliedAt = useRef(0);
  useEffect(() => {
    if (Object.is(value, settled)) {
      return;
    }
    const apply = () => {
      lastAppliedAt.current = Date.now();
      setSettled(value);
    };
    const wait = delay - (Date.now() - lastAppliedAt.current);
    if (wait <= 0) {
      apply();
      return;
    }
    const timer = setTimeout(apply, wait);
    return () => clearTimeout(timer);
  }, [value, delay, settled]);
  return settled;
}
const PAN_PADDING = 240;

const animMs = (ms: number) =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : ms;

const reportViewportMoveFailure = (error: unknown) => {
  toast.error('Failed to move the pipeline view', { description: String(error) });
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.25;
const ABSOLUTE_MIN_ZOOM = 0.05;

function fitMinZoom(graphW: number, graphH: number, paneW: number, paneH: number) {
  if (graphW <= 0 || graphH <= 0 || paneW <= 0 || paneH <= 0) {
    return MIN_ZOOM;
  }
  const fit = 0.9 * Math.min(paneW / graphW, paneH / graphH);
  return Math.min(MIN_ZOOM, Math.max(ABSOLUTE_MIN_ZOOM, fit));
}

// WARNING: Measure all bounds instead of assuming the origin; resource cards can sit at negative coordinates.
function contentBounds(nodes: Node[]) {
  const layoutSizeOnly: MeasuredById = new Map();
  const box = nodes
    .filter((node) => !node.parentId)
    .reduce<ScopeBounds | null>((acc, node) => growBounds(acc, nodeRect(node, layoutSizeOnly)), null);
  return box ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
const MINIMAP_WIDTH = 132;
const MINIMAP_MIN_INNER_H = 32;
const MINIMAP_MAX_INNER_H = 168;
const MINIMAP_PAD = 2;
const MINIMAP_BORDER = 1;

const clampValue = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

function miniMapNodeColor(node: Node) {
  return sectionAccent((node.data as FlowCardData | undefined)?.section) ?? 'transparent';
}

type FlowExtent = [[number, number], [number, number]];
type FlowViewport = { left: number; top: number; width: number; height: number; zoom: number };
type MiniMapProjection = {
  mapW: number;
  mapH: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};
type MiniMapLayout = {
  viewport: FlowViewport;
  ext: ScopeBounds;
  canPanX: boolean;
  canPanY: boolean;
  projection: MiniMapProjection;
  view: { x: number; y: number; w: number; h: number };
};

function flowViewport([tx, ty, zoom]: [number, number, number], paneWidth: number, paneHeight: number) {
  const visibleViewport: FlowViewport = {
    left: -tx / zoom,
    top: -ty / zoom,
    width: paneWidth / zoom,
    height: paneHeight / zoom,
    zoom,
  };
  return visibleViewport;
}

// WARNING: Keep the live viewport in the minimap bounds; React Flow does not re-clamp the transform when its extent changes.
function miniMapWorld(ext: ScopeBounds, vp: FlowViewport) {
  const canPanX = vp.width < ext.maxX - ext.minX;
  const canPanY = vp.height < ext.maxY - ext.minY;
  const world = {
    minX: canPanX ? Math.min(ext.minX, vp.left) : vp.left,
    maxX: canPanX ? Math.max(ext.maxX, vp.left + vp.width) : vp.left + vp.width,
    minY: canPanY ? Math.min(ext.minY, vp.top) : vp.top,
    maxY: canPanY ? Math.max(ext.maxY, vp.top + vp.height) : vp.top + vp.height,
  };
  const mapWorld: { world: ScopeBounds; canPanX: boolean; canPanY: boolean } = { world, canPanX, canPanY };
  return mapWorld;
}

function miniMapProjection(world: ScopeBounds) {
  const mapW = MINIMAP_WIDTH - 2 * MINIMAP_BORDER;
  const worldW = Math.max(world.maxX - world.minX, 1);
  const worldH = Math.max(world.maxY - world.minY, 1);
  const innerW = mapW - 2 * MINIMAP_PAD;
  const innerH = clampValue(innerW * (worldH / worldW), MINIMAP_MIN_INNER_H, MINIMAP_MAX_INNER_H);
  const scaleX = innerW / worldW;
  const scaleY = innerH / worldH;
  const mapProjection: MiniMapProjection = {
    mapW,
    mapH: innerH + 2 * MINIMAP_PAD,
    scaleX,
    scaleY,
    offsetX: MINIMAP_PAD - world.minX * scaleX,
    offsetY: MINIMAP_PAD - world.minY * scaleY,
  };
  return mapProjection;
}

function miniMapLayout(
  transform: [number, number, number],
  paneWidth: number,
  paneHeight: number,
  translateExtent: FlowExtent
) {
  const viewport = flowViewport(transform, paneWidth, paneHeight);
  const [[minX, minY], [maxX, maxY]] = translateExtent;
  const ext = { minX, minY, maxX, maxY };
  const { world, canPanX, canPanY } = miniMapWorld(ext, viewport);
  const projection = miniMapProjection(world);
  const { scaleX, scaleY, offsetX, offsetY } = projection;
  const view = {
    x: viewport.left * scaleX + offsetX,
    y: viewport.top * scaleY + offsetY,
    w: viewport.width * scaleX,
    h: viewport.height * scaleY,
  };
  const viewportLayout: MiniMapLayout = { viewport, ext, canPanX, canPanY, projection, view };
  return viewportLayout;
}

function miniMapPanCentre(layout: MiniMapLayout, px: number, py: number) {
  const { ext, viewport: vp, projection, canPanX, canPanY } = layout;
  const fx = (px - projection.offsetX) / projection.scaleX;
  const fy = (py - projection.offsetY) / projection.scaleY;
  return {
    cx: canPanX ? clampValue(fx, ext.minX + vp.width / 2, ext.maxX - vp.width / 2) : (ext.minX + ext.maxX) / 2,
    cy: canPanY ? clampValue(fy, ext.minY + vp.height / 2, ext.maxY - vp.height / 2) : (ext.minY + ext.maxY) / 2,
  };
}

/** Overview minimap; draws only the pan-reachable world (see `miniMapWorld`). Click/drag re-centres. */
export function PipelineMiniMap({ nodes, translateExtent }: { nodes: Node[]; translateExtent: FlowExtent }) {
  const transform = useStore((s) => s.transform);
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);
  const { setCenter } = useReactFlow();
  const draggingRef = useRef(false);
  const layout = miniMapLayout(transform, paneWidth, paneHeight, translateExtent);
  const {
    projection: { mapW, mapH, scaleX, scaleY, offsetX, offsetY },
    view,
  } = layout;

  const panToEvent = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { cx, cy } = miniMapPanCentre(layout, e.clientX - rect.left, e.clientY - rect.top);
    setCenter(cx, cy, { zoom: layout.viewport.zoom, duration: 0 }).catch(reportViewportMoveFailure);
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

const SELECTION_REVEAL_MARGIN = 32;
const RAIL_SETTLE_MS = 240;

function nodeInScope(node: Node, scope: ReadonlySet<string>) {
  return scope.has(node.id) || scope.has((node.data as FlowCardData).ownerId ?? ' ');
}

function focusDimNodes(
  rfNodes: Node[],
  selectedNodeId: string | undefined,
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined
) {
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

const staleFlowClass = (stale: boolean) => `transition-opacity duration-200 ${stale ? 'opacity-60' : ''}`;

const CANVAS_NOTICE_POSITION = 'absolute top-3 left-1/2 z-20 -translate-x-1/2';

function StaleParseBanner({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return (
    <InvalidConfigNotice className={CANVAS_NOTICE_POSITION} variant="floating">
      Can&apos;t visualize the latest YAML — showing the last valid layout.
    </InvalidConfigNotice>
  );
}

type ZoomMode = 'in' | 'out' | null;
const ZOOM_STEP = 1.5;

function cursorForMode(mode: ZoomMode): string {
  return mode === 'in' ? 'zoom-in' : mode === 'out' ? 'zoom-out' : '';
}

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

const canPanCanvas = (mode: ZoomMode) => mode === null;

function heldZoomMode(zDown: boolean, alt: boolean): ZoomMode {
  return zDown ? (alt ? 'out' : 'in') : null;
}

const isTypingTarget = (target: EventTarget | null) =>
  Boolean(
    (target as HTMLElement | null)?.closest(
      'input, textarea, [contenteditable="true"], [data-slot="popover-content"], .monaco-editor'
    )
  );

function ZoomTool({ mode, setMode, minZoom }: { mode: ZoomMode; setMode: (next: ZoomMode) => void; minZoom: number }) {
  const { screenToFlowPosition, getZoom, setCenter } = useReactFlow();

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
      e.preventDefault();
      e.stopPropagation();
      const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const next = clampValue(getZoom() * (mode === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP), minZoom, MAX_ZOOM);
      setCenter(point.x, point.y, { zoom: next, duration: animMs(200) }).catch(reportViewportMoveFailure);
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [mode, minZoom, screenToFlowPosition, getZoom, setCenter]);

  return null;
}

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
        fitView({ padding: 0.2, minZoom: fitMinZoom(bounds.width, bounds.height, width, height), maxZoom: 1 }).catch(
          reportViewportMoveFailure
        );
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
    const zoom = Math.min(Math.max(getZoom(), 0.8), 1);
    setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { duration: animMs(600), zoom }).catch(
      reportViewportMoveFailure
    );
  }, [nodeId, token, getNodesBounds, setCenter, getZoom]);
  return null;
}

function revealPanDx(bounds: { x: number; width: number }, viewport: { x: number; zoom: number }, paneWidth: number) {
  const screenLeft = bounds.x * viewport.zoom + viewport.x;
  const screenRight = (bounds.x + bounds.width) * viewport.zoom + viewport.x;
  if (screenRight > paneWidth - SELECTION_REVEAL_MARGIN) {
    return paneWidth - SELECTION_REVEAL_MARGIN - screenRight;
  }
  if (screenLeft < SELECTION_REVEAL_MARGIN) {
    return SELECTION_REVEAL_MARGIN - screenLeft;
  }
  return 0;
}

function KeepSelectionInView({ selectedNodeId, focusToken }: { selectedNodeId?: string; focusToken?: number }) {
  const { getNodesBounds, getViewport, setViewport } = useReactFlow();
  const paneWidth = useStore((s) => s.width);
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
      const dx = revealPanDx(bounds, { x, zoom }, paneWidth);
      if (dx !== 0) {
        setViewport({ x: x + dx, y, zoom }, { duration: animMs(200) }).catch(reportViewportMoveFailure);
      }
    }, RAIL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [selectedNodeId, paneWidth, focusToken, getNodesBounds, getViewport, setViewport]);

  return null;
}

const SCOPE_REGION_PAD = 6;
const SCOPE_REGION_TOP_PAD = 6;
const SCOPE_REGION_NEST_STEP = 4;

function constructAccent(node?: Node) {
  const d = node?.data as FlowCardData | undefined;
  return d?.isErrorPath ? 'var(--color-destructive)' : (sectionAccent(d?.section) ?? 'var(--color-primary)');
}

type ScopeBounds = { minX: number; minY: number; maxX: number; maxY: number };
type Point = { x: number; y: number };
type MeasuredById = Map<string, { measured?: { width?: number; height?: number } }>;
type ScopeGeometry = { body: ScopeBounds; entry: ScopeBounds | null };

function nodeRect(n: Node, measuredById: MeasuredById) {
  const m = measuredById.get(n.id)?.measured;
  const w = (m?.width ?? n.initialWidth ?? n.width ?? 0) as number;
  const h = (m?.height ?? n.initialHeight ?? n.height ?? 0) as number;
  const measuredBounds: ScopeBounds = {
    minX: n.position.x,
    minY: n.position.y,
    maxX: n.position.x + w,
    maxY: n.position.y + h,
  };
  return measuredBounds;
}

const growBounds = (box: ScopeBounds | null, r: ScopeBounds) =>
  box
    ? {
        minX: Math.min(box.minX, r.minX),
        minY: Math.min(box.minY, r.minY),
        maxX: Math.max(box.maxX, r.maxX),
        maxY: Math.max(box.maxY, r.maxY),
      }
    : r;

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
  pad: number;
  topPad: number;
};

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

type ScopeArm = { side: 'left' | 'right'; outerX: number; top: number; bottom: number };

function entrySide(entry: ScopeBounds, body: ScopeBounds) {
  return entry.maxX <= body.minX ? 'left' : entry.minX >= body.maxX ? 'right' : undefined;
}

function armSpan(entry: ScopeBounds, pb: ScopeBounds, pad: number) {
  const top = entry.minY - pad;
  const bottom = entry.maxY + pad;
  if (bottom < pb.minY) {
    return { top, bottom: pb.minY };
  }
  if (top > pb.maxY) {
    return { top: pb.maxY, bottom };
  }
  return { top: Math.max(top, pb.minY), bottom: Math.min(bottom, pb.maxY) };
}

function entryArm(entry: ScopeBounds, body: ScopeBounds, pb: ScopeBounds, pad: number): ScopeArm | undefined {
  const side = entrySide(entry, body);
  if (!side) {
    return;
  }
  const { top, bottom } = armSpan(entry, pb, pad);
  return bottom > top
    ? { side, outerX: side === 'left' ? entry.minX - pad : entry.maxX + pad, top, bottom }
    : undefined;
}

function armRect(arm: ScopeArm, pb: ScopeBounds): ScopeBounds {
  return arm.side === 'left'
    ? { minX: arm.outerX, minY: arm.top, maxX: pb.minX, maxY: arm.bottom }
    : { minX: pb.maxX, minY: arm.top, maxX: arm.outerX, maxY: arm.bottom };
}

function regionPath(pb: ScopeBounds, arm?: ScopeArm) {
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

/**
 * The arm joins a separate entry to its padded body and stays narrow enough not to cross sibling regions.
 */
export function regionGeometry(
  body: ScopeBounds,
  entry: ScopeBounds | null,
  pad: number,
  topPad: number
): RegionGeometry {
  const pb = { minX: body.minX - pad, minY: body.minY - topPad, maxX: body.maxX + pad, maxY: body.maxY + pad };
  const arm = entry ? entryArm(entry, body, pb, pad) : undefined;
  const rects: ScopeBounds[] = arm ? [pb, armRect(arm, pb)] : [pb];
  const outer = rects.reduce(growBounds);
  const path = `M${regionPath(pb, arm)
    .map((p) => `${p.x - outer.minX} ${p.y - outer.minY}`)
    .join('L')}Z`;
  return {
    rects,
    path,
    bbox: { x: outer.minX, y: outer.minY, w: outer.maxX - outer.minX, h: outer.maxY - outer.minY },
    anchor: { x: pb.minX, y: pb.minY },
  };
}

const RegionBox = memo(({ region, active }: { region: ScopeRegion; active: boolean }) => {
  const { body, entry, accent, label, pad, topPad } = region;
  const borderColor = `color-mix(in srgb, ${accent} ${active ? 70 : 32}%, transparent)`;
  const backgroundColor = `color-mix(in srgb, ${accent} ${active ? 10 : 5}%, transparent)`;
  const { rects, path, bbox, anchor } = useMemo(
    () => regionGeometry(body, entry, pad, topPad),
    [body, entry, pad, topPad]
  );

  return (
    <>
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
          className="absolute bottom-full left-2 mb-0.5 rounded px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase transition-opacity duration-200"
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
  tryCatchPairs: ReadonlyMap<string, string>;
};

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
  const nodeLookup = useStore((s) => s.nodeLookup);
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
    let h = 0;
    for (const id of scopedIds) {
      const m = s.nodeLookup.get(id)?.measured;
      h = (h * 31 + Math.round(m?.width ?? 0)) % 2_147_483_647;
      h = (h * 31 + Math.round(m?.height ?? 0)) % 2_147_483_647;
    }
    return h;
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: measuredKey re-triggers bounds when cards measure.
  const regions = useMemo<ScopeRegion[]>(() => {
    const absorbed = new Set(tryCatchPairs.values());
    const ctx: RegionContext = { rfNodes, scopeOf, nodeLookup, tryCatchPairs };
    const drafts = rfNodes
      .filter((n) => n.type === 'flowSplit' && !absorbed.has(n.id))
      .map((n) => scopeRegionDraft(n, ctx))
      .filter((d): d is ScopeRegionDraft => d !== null);
    const depthOf = (r: ScopeRegionDraft) => drafts.filter((o) => o.id !== r.id && o.scope.has(r.id)).length;
    const depths = drafts.map(depthOf);
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
  onSetStopCondition?: (nodeId: string, draft: StopConditionDraft | null) => boolean;
  collapsedIds: ReadonlySet<string>;
  toggleCollapse: (nodeId: string) => void;
  selectedNodeId?: string;
  /** Kind of the selected edit target — `'switchCase'` means the condition, not the component. */
  selectedTargetKind?: string;
  lintErrorsByNode?: Map<string, string[]>;
  /** Deprecation warnings by node id. */
  deprecationsByNode?: Map<string, string[]>;
  /** Node ids whose config differs from the last-saved pipeline. */
  unsavedNodeIds?: ReadonlySet<string>;
  flashNodeIds?: ReadonlySet<string>;
  flashToken?: number;
  /** Node ids present on the previous render — anything new is "appearing". */
  previousIds: ReadonlySet<string>;
};

function wireConnectorActions(data: FlowCardData, cb: CanvasCallbacks) {
  if (data.label === 'none' && cb.onAddConnector) {
    data.onAddConnector = cb.onAddConnector;
  }
  if (data.missingTopic && cb.onAddTopic) {
    data.onAddTopic = cb.onAddTopic;
  }
  if (data.missingSasl && cb.onAddSasl) {
    data.onAddSasl = cb.onAddSasl;
  }
}

function wireInsertActions(data: FlowCardData, node: Node, cb: CanvasCallbacks) {
  if (data.addAction && cb.onSlotInsert) {
    const payload = data.addAction.payload;
    data.onAddChild = () => cb.onSlotInsert?.(payload);
  }
  if (data.stopSlot && cb.onSetStopCondition) {
    const setStop = cb.onSetStopCondition;
    data.onSetStopCondition = (draft) => setStop(node.id, draft);
  }
  if (node.type === 'flowInsert' && cb.onSlotInsert) {
    (data as { onInsert?: (payload: FlowInsertPayload) => void }).onInsert = cb.onSlotInsert;
  }
}

function applyInteractionState(data: FlowCardData, node: Node, cb: CanvasCallbacks) {
  if (data.collapsible) {
    data.collapsed = cb.collapsedIds.has(node.id);
    data.onToggle = () => cb.toggleCollapse(node.id);
  }
  if (cb.selectedNodeId && node.id === cb.selectedNodeId) {
    if (data.caseEditTarget && cb.selectedTargetKind === 'switchCase') {
      data.conditionSelected = true;
    } else {
      data.selected = true;
    }
  }
}

function applyIssueBadges(data: FlowCardData, node: Node, cb: CanvasCallbacks) {
  const lintErrors = cb.lintErrorsByNode?.get(node.id);
  if (lintErrors?.length) {
    data.lintErrors = lintErrors;
  }
  const deprecations = cb.deprecationsByNode?.get(node.id);
  if (deprecations?.length) {
    data.deprecations = deprecations;
  }
}

function applyStatusMarks(data: FlowCardData, node: Node, cb: CanvasCallbacks) {
  applyIssueBadges(data, node, cb);
  if (cb.unsavedNodeIds?.has(node.id) || (data.caseOwnerId && cb.unsavedNodeIds?.has(data.caseOwnerId))) {
    data.unsaved = true;
  }
  if (cb.flashNodeIds?.has(node.id)) {
    data.flash = true;
    data.flashToken = cb.flashToken;
  }
}

export function injectNodeData(node: Node, cb: CanvasCallbacks): Node {
  const data = { ...node.data } as FlowCardData;
  applyInteractionState(data, node, cb);
  applyStatusMarks(data, node, cb);
  wireConnectorActions(data, cb);
  wireInsertActions(data, node, cb);
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

function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      className="inline-block h-0 w-5 shrink-0 align-middle"
      style={{ borderTopColor: color, borderTopWidth: 2, borderTopStyle: dashed ? 'dashed' : 'solid' }}
    />
  );
}

function LegendChipSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-5 shrink-0 rounded-sm align-middle"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, border: `1px solid ${color}` }}
    />
  );
}

function FlowLegend({ flags }: { flags: LegendFlags }) {
  if (!(flags.condition || flags.error || flags.reference)) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-md border border-border bg-background/90 px-3 py-2 text-body-sm text-muted-foreground shadow-sm backdrop-blur-sm">
      <div className="text-2xs font-semibold tracking-wide text-muted-foreground/70 uppercase">Legend</div>
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

function decorateReferenceEdge(edge: Edge, activeScope: ReadonlySet<string> | undefined) {
  const touchesActive = activeScope !== undefined && (activeScope.has(edge.source) || activeScope.has(edge.target));
  const decoratedEdge: Edge = { ...edge, data: { ...edge.data, emphasized: touchesActive, faint: !touchesActive } };
  return decoratedEdge;
}

type EdgeActionData = {
  insertIndex?: number;
  slotPayload?: FlowInsertPayload;
  selectId?: string;
  selectTarget?: EditTarget;
};

function withInsertHandler(edge: Edge, { onInsert, onSlotInsert }: DecorateEdgeOptions) {
  const edgeData = edge.data as EdgeActionData | undefined;
  const insertIndex = edgeData?.insertIndex;
  const slotPayload = edgeData?.slotPayload;
  if (onInsert && edge.type === 'flowGraphEdge' && insertIndex !== undefined) {
    return { ...edge, data: { ...edge.data, onInsert: () => onInsert(insertIndex) } };
  }
  if (onSlotInsert && edge.type === 'flowGraphEdge' && slotPayload) {
    return { ...edge, data: { ...edge.data, onInsert: () => onSlotInsert(slotPayload) } };
  }
  return edge;
}

function withLabelClick(edge: Edge, onSelectNode: DecorateEdgeOptions['onSelectNode']) {
  const edgeData = edge.data as EdgeActionData | undefined;
  if (!(onSelectNode && edgeData?.selectId && edgeData.selectTarget)) {
    return edge;
  }
  const { selectId, selectTarget } = edgeData;
  return { ...edge, data: { ...edge.data, onLabelClick: () => onSelectNode(selectId, selectTarget) } };
}

export function decorateEdges(edges: Edge[], options: DecorateEdgeOptions) {
  const { selectedScope, hoveredScope } = options;
  const activeScope = selectedScope ?? hoveredScope;
  return edges.map<Edge>((edge) => {
    const next = withLabelClick(withInsertHandler(edge, options), options.onSelectNode);
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

export function selectionTargetForNode(
  node: Node,
  nodes: Node[]
): { id: string; target: EditTarget; caseTarget?: EditTarget } | null {
  let current: Node | undefined = node;
  while (current && !(current.data as FlowCardData).editTarget) {
    const ownerId: string | undefined = current.parentId ?? (current.data as FlowCardData).ownerId;
    current = ownerId ? nodes.find((n) => n.id === ownerId) : undefined;
  }
  const target = current && (current.data as FlowCardData).editTarget;
  if (!(current && target)) {
    return null;
  }
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
  /** Deprecation warnings mapped to node ids — badged in place on the canvas. */
  deprecationsByNode?: Map<string, string[]>;
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
  onInsert?: (processorIndex: number) => void;
  onSlotInsert?: (payload: FlowInsertPayload) => void;
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  /** Set or clear an input's stop condition (`read_until`) from its card's stop row. */
  onSetStopCondition?: (nodeId: string, draft: StopConditionDraft | null) => boolean;
};

function layoutCanvasGraph(nodes: PipelineFlowNode[], editable: boolean) {
  const layout = computeGraphLayout(nodes, editable);

  const margin = PAN_PADDING;
  const bounds = contentBounds(layout.rfNodes);
  const extent: FlowExtent = [
    [bounds.minX - margin, bounds.minY - margin],
    [bounds.maxX + margin, bounds.maxY + margin],
  ];

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
}

function tryCatchPairsOf(layoutEdges: Edge[]) {
  const pairs = new Map<string, string>();
  for (const edge of layoutEdges) {
    if (edge.id.startsWith('error-')) {
      pairs.set(edge.source, edge.target);
    }
  }
  return pairs;
}

function useCanvasGraph(configYaml: string, editable: boolean) {
  const debouncedYaml = useLeadingDebouncedValue(configYaml, PARSE_DEBOUNCE_MS);
  const { nodes, error, showingStale } = useResilientParse(debouncedYaml);

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

  const layout = useMemo(() => layoutCanvasGraph(nodes, editable), [nodes, editable]);
  const tryCatchPairs = useMemo(() => tryCatchPairsOf(layout.layoutEdges), [layout.layoutEdges]);
  return { ...layout, error, showingStale, scopeOf, tryCatchPairs };
}

function useCanvasZoom() {
  const [zoomMode, setZoomMode] = useState<ZoomMode>(null);
  const [minZoom, setMinZoom] = useState(MIN_ZOOM);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useZoomCursor(zoomMode, wrapperRef);
  return { wrapperRef, zoomMode, setZoomMode, minZoom, setMinZoom };
}

type DecoratedNodesOptions = Omit<CanvasCallbacks, 'collapsedIds' | 'toggleCollapse' | 'previousIds'> & {
  layoutNodes: Node[];
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined;
  showingStale: boolean;
};

function useMeasuredNodes(nodes: Node[]) {
  const measuredRef = useRef(new Map<string, NonNullable<Node['measured']>>());
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) {
        measuredRef.current.set(change.id, change.dimensions);
      }
    }
  }, []);
  const measuredNodes = useMemo(
    () =>
      nodes.map((node) => {
        const measured = measuredRef.current.get(node.id);
        return measured ? { ...node, measured } : node;
      }),
    [nodes]
  );
  return { measuredNodes, onNodesChange };
}

function useDecoratedNodes({
  layoutNodes,
  scopeOf,
  onAddConnector,
  onAddTopic,
  onAddSasl,
  onSlotInsert,
  onSetStopCondition,
  showingStale,
  selectedNodeId,
  selectedTargetKind,
  lintErrorsByNode,
  deprecationsByNode,
  unsavedNodeIds,
  flashNodeIds,
  flashToken,
}: DecoratedNodesOptions) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
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
  const previousIdsRef = useRef<ReadonlySet<string>>(new Set());

  // WARNING: Keep hover and selection out of the layout cache key; repeated Dagre runs can churn the graph and drop pointer events.
  const rfNodes = useMemo(() => {
    const callbacks: CanvasCallbacks = {
      onAddConnector,
      onAddTopic,
      onAddSasl,
      onSlotInsert,
      // WARNING: Do not edit stop conditions through a stale layout; its paths can now select a different YAML node.
      onSetStopCondition: showingStale ? undefined : onSetStopCondition,
      collapsedIds,
      toggleCollapse,
      selectedNodeId,
      selectedTargetKind,
      lintErrorsByNode,
      deprecationsByNode,
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
    deprecationsByNode,
    unsavedNodeIds,
    flashNodeIds,
    flashToken,
    onAddConnector,
    onAddTopic,
    onAddSasl,
    onSlotInsert,
    onSetStopCondition,
    showingStale,
    scopeOf,
  ]);

  useEffect(() => {
    previousIdsRef.current = new Set(rfNodes.map((node) => node.id));
  }, [rfNodes]);

  return rfNodes;
}

/**
 * Uses the last good graph while edited YAML cannot parse, without allowing edits through that stale layout. Region fills are split so tall graphs stay below the paintable height limit; their dashed outline remains one path.
 */
export function PipelineFlowCanvas({
  configYaml,
  selectedNodeId,
  selectedTargetKind,
  lintErrorsByNode,
  deprecationsByNode,
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
  onSetStopCondition,
}: PipelineFlowCanvasProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();
  const { wrapperRef, zoomMode, setZoomMode, minZoom, setMinZoom } = useCanvasZoom();
  // WARNING: Pass the active theme to React Flow; its default light class otherwise overrides the canvas palette.
  const appearance = useThemeAppearance();
  const {
    error,
    showingStale,
    scopeOf,
    layoutNodes,
    layoutEdges,
    translateExtent,
    contentWidth,
    contentHeight,
    legend,
    tryCatchPairs,
  } = useCanvasGraph(configYaml, Boolean(onSlotInsert));
  const rfNodes = useDecoratedNodes({
    layoutNodes,
    scopeOf,
    onAddConnector,
    onAddTopic,
    onAddSasl,
    onSlotInsert,
    onSetStopCondition,
    showingStale,
    selectedNodeId,
    selectedTargetKind,
    lintErrorsByNode,
    deprecationsByNode,
    unsavedNodeIds,
    flashNodeIds,
    flashToken,
  });
  const { measuredNodes, onNodesChange } = useMeasuredNodes(rfNodes);

  // WARNING: Hover must leave node identities stable; rebuilding the hovered node causes enter/leave loops and can eat clicks.
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
        {error ? (
          <InvalidConfigNotice className={CANVAS_NOTICE_POSITION} variant="floating">
            Unable to visualize this pipeline — fix the YAML in the YAML tab.
          </InvalidConfigNotice>
        ) : null}
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
          colorMode={appearance}
          edges={rfEdges}
          edgeTypes={flowEdgeTypes}
          elementsSelectable={false}
          maxZoom={MAX_ZOOM}
          minZoom={minZoom}
          nodes={measuredNodes}
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
          // WARNING: Clear only the tracked node; enter(child) followed by leave(parent) must not clear the child's hover.
          onNodeMouseLeave={(_, node) => setHoveredNodeId((prev) => (prev === node.id ? undefined : prev))}
          onNodesChange={onNodesChange}
          onPaneClick={() => onClearSelection?.()}
          panOnDrag={canPanCanvas(zoomMode)}
          panOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          translateExtent={translateExtent}
          zoomOnDoubleClick
          zoomOnPinch
          zoomOnScroll={false}
        >
          <Background
            color="color-mix(in srgb, var(--color-border) 30%, transparent)"
            gap={28}
            size={4}
            variant={BackgroundVariant.Cross}
          />
          <Controls position="bottom-right" showInteractive={false} />
          <PipelineMiniMap nodes={rfNodes} translateExtent={translateExtent} />
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
