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

import { useReactFlow, useStore, useStoreApi } from '@xyflow/react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { sectionAccent } from './pipeline-flow-canvas-nodes';
import type { PipelineStyle } from './pipeline-style';
import type { FlowNode as Node } from '../utils/pipeline-flow-layout';
import './pipeline-editor.css';

// RF's pan/zoom eases are d3-driven (JS), beyond the CSS reduced-motion rule — collapse them to instant.
export const animMs = (ms: number): number =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : ms;

// Viewport moves resolve once their animation ends; surface a move that fails rather than dropping it.
export const reportViewportMoveFailure = (error: unknown) => {
  toast.error('Failed to move the pipeline view', { description: String(error) });
};

export const MIN_ZOOM = 0.5;

export const MAX_ZOOM = 1.25;

// Floor for graphs too big to fit even at MIN_ZOOM — never below this, so it can't zoom out to a dot.
const ABSOLUTE_MIN_ZOOM = 0.05;

// Zoom-out floor: MIN_ZOOM normally, down to ABSOLUTE_MIN_ZOOM when the graph is too big to fit.
export function fitMinZoom(graphW: number, graphH: number, paneW: number, paneH: number): number {
  if (graphW <= 0 || graphH <= 0 || paneW <= 0 || paneH <= 0) {
    return MIN_ZOOM;
  }
  // 0.9 leaves a little margin around the fully-zoomed-out graph.
  const fit = 0.9 * Math.min(paneW / graphW, paneH / graphH);
  return Math.min(MIN_ZOOM, Math.max(ABSOLUTE_MIN_ZOOM, fit));
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
  return sectionAccent(node.data.section) ?? 'transparent';
}

export type FlowExtent = [[number, number], [number, number]];

// The live viewport in flow coordinates.
type FlowViewport = { left: number; top: number; width: number; height: number; zoom: number };

// Flow → minimap pixels, per axis.
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
  /** The viewport rect, in minimap pixels. */
  view: { x: number; y: number; w: number; h: number };
};

function flowViewport([tx, ty, zoom]: [number, number, number], paneWidth: number, paneHeight: number): FlowViewport {
  return { left: -tx / zoom, top: -ty / zoom, width: paneWidth / zoom, height: paneHeight / zoom, zoom };
}

// Per axis: viewport smaller than extent → whole extent is reachable, show it; else the axis is
// locked, so show the live visible window (RF pins an oversized viewport to an edge).
// The extent is unioned with the viewport because RF doesn't re-clamp the transform when
// `translateExtent` moves (an insert re-runs Dagre), so the viewport can sit partly outside the
// extent until the next pan — without the union its rect would draw past the svg edge and clip.
function miniMapWorld(ext: ScopeBounds, vp: FlowViewport): { world: ScopeBounds; canPanX: boolean; canPanY: boolean } {
  const canPanX = vp.width < ext.maxX - ext.minX;
  const canPanY = vp.height < ext.maxY - ext.minY;
  const world = {
    minX: canPanX ? Math.min(ext.minX, vp.left) : vp.left,
    maxX: canPanX ? Math.max(ext.maxX, vp.left + vp.width) : vp.left + vp.width,
    minY: canPanY ? Math.min(ext.minY, vp.top) : vp.top,
    maxY: canPanY ? Math.max(ext.maxY, vp.top + vp.height) : vp.top + vp.height,
  };
  return { world, canPanX, canPanY };
}

function miniMapProjection(world: ScopeBounds): MiniMapProjection {
  // Fill the frame's content box (frame minus its 1px border each side) so nothing is clipped.
  const mapW = MINIMAP_WIDTH - 2 * MINIMAP_BORDER;
  const worldW = Math.max(world.maxX - world.minX, 1);
  const worldH = Math.max(world.maxY - world.minY, 1);
  // Each axis scales independently so a clamp-forced aspect mismatch can't leave dead bands.
  const innerW = mapW - 2 * MINIMAP_PAD;
  const innerH = clampValue(innerW * (worldH / worldW), MINIMAP_MIN_INNER_H, MINIMAP_MAX_INNER_H);
  const scaleX = innerW / worldW;
  const scaleY = innerH / worldH;
  return {
    mapW,
    mapH: innerH + 2 * MINIMAP_PAD,
    scaleX,
    scaleY,
    offsetX: MINIMAP_PAD - world.minX * scaleX,
    offsetY: MINIMAP_PAD - world.minY * scaleY,
  };
}

function miniMapLayout(
  transform: [number, number, number],
  paneWidth: number,
  paneHeight: number,
  translateExtent: FlowExtent
): MiniMapLayout {
  const viewport = flowViewport(transform, paneWidth, paneHeight);
  // The SAME `translateExtent` passed to <ReactFlow>, so the minimap agrees with the canvas on reach.
  const [[minX, minY], [maxX, maxY]] = translateExtent;
  const ext = { minX, minY, maxX, maxY };
  const { world, canPanX, canPanY } = miniMapWorld(ext, viewport);
  const projection = miniMapProjection(world);
  const { scaleX, scaleY, offsetX, offsetY } = projection;
  // The world is built to contain the viewport (union above), so the rect needs no clamping; on a
  // locked axis it fills edge-to-edge.
  const view = {
    x: viewport.left * scaleX + offsetX,
    y: viewport.top * scaleY + offsetY,
    w: viewport.width * scaleX,
    h: viewport.height * scaleY,
  };
  return { viewport, ext, canPanX, canPanY, projection, view };
}

// The flow point to centre on for a pointer at minimap pixel (`px`, `py`): clamped to the drag
// extent, and locked to the extent centre on an axis too small to pan.
function miniMapPanCentre(layout: MiniMapLayout, px: number, py: number): { cx: number; cy: number } {
  const { ext, viewport: vp, projection, canPanX, canPanY } = layout;
  const fx = (px - projection.offsetX) / projection.scaleX;
  const fy = (py - projection.offsetY) / projection.scaleY;
  return {
    cx: canPanX ? clampValue(fx, ext.minX + vp.width / 2, ext.maxX - vp.width / 2) : (ext.minX + ext.maxX) / 2,
    cy: canPanY ? clampValue(fy, ext.minY + vp.height / 2, ext.maxY - vp.height / 2) : (ext.minY + ext.maxY) / 2,
  };
}

// Overview minimap; draws only the pan-reachable world (see `miniMapWorld`). Click/drag re-centres.
// Exported for tests.
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

  const style: PipelineStyle = {
    '--pipeline-minimap-width': `${MINIMAP_WIDTH}px`,
    '--pipeline-minimap-height': `${mapH + 2 * MINIMAP_BORDER}px`,
  };
  return (
    <div
      className="pipeline-minimap nodrag nopan absolute z-10 overflow-hidden rounded-md border border-border bg-card shadow-sm"
      style={style}
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
          if ((node.parentId ?? '') || color === 'transparent') {
            return null;
          }
          const w = (node.initialWidth ?? node.width ?? 0) * scaleX;
          const h = (node.initialHeight ?? node.height ?? 0) * scaleY;
          return (
            <rect
              fill={color}
              height={Math.max(h, 2)}
              key={node.id}
              opacity={0.85}
              rx={1.5}
              width={Math.max(w, 2)}
              x={node.position.x * scaleX + offsetX}
              y={node.position.y * scaleY + offsetY}
            />
          );
        })}
        <rect
          fill="var(--color-primary)"
          fillOpacity={0.12}
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

// The zoom tool's armed state: a magnifier-`+` (zoom in) or `-` (zoom out) cursor, or off.
export type ZoomMode = 'in' | 'out' | null;

const ZOOM_STEP = 1.5;

// Spring-loaded: held Z → zoom-in, held Z + Option/Alt → zoom-out, nothing held → off.
function heldZoomMode(zDown: boolean, alt: boolean): ZoomMode {
  return zDown ? (alt ? 'out' : 'in') : null;
}

// Typing, or anything inside our popovers (e.g. a stop-condition editor's radios), keeps its own keys.
// Not any role="dialog": a host shell's dialog around the canvas would match.
const isTypingTarget = (target: EventTarget | null): boolean =>
  Boolean(
    target instanceof Element &&
      target.closest('input, textarea, [contenteditable="true"], [data-slot="popover-content"], .monaco-editor')
  );

// Figma-style hold-to-activate zoom: while Z is held a click zooms toward the pointer (Option/Alt to
// zoom out); releasing returns to pan/select. The wheel is left to the page. Ignored while typing.
export function ZoomTool({
  mode,
  setMode,
  minZoom,
}: {
  mode: ZoomMode;
  setMode: (next: ZoomMode) => void;
  minZoom: number;
}) {
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
      if (!(e.target instanceof Element && e.target.closest('.react-flow__pane, .react-flow__node'))) {
        return;
      }
      // Take the click before React Flow's select/deselect runs, and zoom toward the pointer.
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

// Frame the graph on first load: centered and zoomed to fit. Retries each frame until pane size and
// node bounds are real, so it fires ASAP rather than waiting for a later resize (a visible "snap").
export function FitOnInit() {
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

export type ScopeBounds = { minX: number; minY: number; maxX: number; maxY: number };

type LegendFlags = { condition: boolean; error: boolean; reference: boolean };

// A line swatch matching the edge styles drawn on the canvas.
function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  const style: PipelineStyle = {
    '--pipeline-legend-color': color,
    '--pipeline-legend-line': dashed === true ? 'dashed' : 'solid',
  };
  return <span className="pipeline-legend-line inline-block h-0 w-5 shrink-0 align-middle" style={style} />;
}

// A filled chip swatch for node-borne vocabulary (routing condition), vs. edge line swatches.
function LegendChipSwatch({ color }: { color: string }) {
  const style: PipelineStyle = { '--pipeline-legend-color': color };
  return <span className="pipeline-legend-chip inline-block h-3 w-5 shrink-0 rounded-sm align-middle" style={style} />;
}

// Explains the diagram vocabulary; only the kinds present in the current diagram are listed.
export function FlowLegend({ flags }: { flags: LegendFlags }) {
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
