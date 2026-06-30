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
  useNodesInitialized,
  useReactFlow,
  useStore,
  ViewportPortal,
} from '@xyflow/react';
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
  computeFlowLayout,
  type FlowInsertPayload,
  type FlowOrientation,
  type PipelineFlowNode,
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
// Small inset between the drawing and the frame, so the viewport rect's border stays visible at
// the pan limits rather than sitting hard against the edge.
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

  // Draw only the pan-REACHABLE world. Per axis: while the viewport is smaller than the extent the
  // whole extent is reachable by panning, so show it; otherwise that axis is locked, so show the
  // fixed visible window — never buffer the viewport can't reach. Locked axes use the live window
  // (React Flow pins an oversized viewport to an edge, not an assumed centre).
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

  // The world fills the drawing area (frame minus the small MINIMAP_PAD inset) so the viewport rect
  // sits all but flush against the edges at the pan limits. Frame height tracks the world's aspect
  // (clamped to stay usable); each axis is then scaled to fill exactly — a single uniform scale
  // would letterbox once the clamp forces a frame aspect different from the world's, leaving dead
  // bands the viewport can't reach. When the aspects match (the common case) the two scales are
  // equal, so there's no distortion.
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

// Keeps the selected node visible when the inspector rail opens. The rail is a flex sibling
// that steals ~384px on the right, so a node near the right edge ends up hidden behind it.
// Once the rail's open animation settles (pane stops resizing), nudge the viewport just enough
// to reveal the node — only if actually clipped. The minimal dx stays inside `translateExtent`,
// so no clamping is needed.
// Parse the YAML into the flow tree, keeping the last successfully-parsed nodes. While the YAML
// is transiently invalid — mid-edit, a bad paste, switching to the Visual lane on a half-written
// config — the parser yields no nodes; blanking the canvas there loses the user's place and reads
// as broken. So we hold the last-good graph and flag it stale (the Step Functions / Kestra
// "freeze last-good + banner" pattern). Extracted from the component to keep it under the
// cognitive-complexity budget.
function useResilientParse(
  yaml: string,
  simple: boolean | undefined
): { nodes: PipelineFlowNode[]; error?: string; showingStale: boolean } {
  const parsed = useMemo(() => parsePipelineFlowTree(yaml), [yaml]);
  const lastGoodNodesRef = useRef<PipelineFlowNode[]>(parsed.nodes);
  if (!parsed.error) {
    lastGoodNodesRef.current = parsed.nodes;
  }
  const showingStale =
    Boolean(parsed.error) && parsed.nodes.length === 0 && lastGoodNodesRef.current.length > 0 && !simple;
  return { nodes: showingStale ? lastGoodNodesRef.current : parsed.nodes, error: parsed.error, showingStale };
}

// Selecting a control-flow construct focuses its branch: nodes OUTSIDE its scope fade back, so the
// construct's members read clearly even where the dashed region box is suppressed (Dagre can
// scatter members so a box would enclose a foreign card — see boxEnclosesForeignNode). Complements
// the edge-scope dimming. Module-level (and driven by selection, which already rebuilds the nodes
// array) so it stays off the cheap-hover path and out of PipelineFlowCanvas's complexity budget.
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
    const inScope = focus.has(node.id) || focus.has((node.data as FlowCardData).ownerId ?? ' ');
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

// The native magnifier cursor for the armed zoom tool.
function cursorForMode(mode: ZoomMode): string {
  if (mode === 'in') {
    return 'zoom-in';
  }
  if (mode === 'out') {
    return 'zoom-out';
  }
  return '';
}

// Paint the magnifier cursor while the zoom tool is armed. Set imperatively (inline) on the flow
// container AND its pane: React Flow styles the pane cursor itself, so a Tailwind class loses to it,
// but an inline style on the pane reliably wins — and the container style covers nodes by inheritance.
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
const canPanCanvas = (simple: boolean | undefined, mode: ZoomMode): boolean => !simple && mode === null;

// The zoom tool is SPRING-LOADED: held Z → zoom-in, held Shift (+Z) → zoom-out, nothing held → off.
function heldZoomMode(zDown: boolean, shift: boolean): ZoomMode {
  if (!zDown) {
    return null;
  }
  return shift ? 'out' : 'in';
}

const isTypingTarget = (target: EventTarget | null): boolean =>
  Boolean((target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"], .monaco-editor'));

// Photoshop/Figma-style zoom TOOL, HOLD to activate: while Z is held the cursor is a magnifier and
// a click zooms toward the pointer (Shift+Z = zoom out); releasing returns to normal pan/select.
// Pan is suppressed only while held (canPanCanvas), so panning and zooming never conflict. The
// wheel is left to the page; the Controls buttons and pinch also zoom. Ignored while typing.
function ZoomTool({ mode, setMode, enabled }: { mode: ZoomMode; setMode: (next: ZoomMode) => void; enabled: boolean }) {
  const { screenToFlowPosition, getZoom, setCenter } = useReactFlow();

  // Track the physical key-hold state and derive the mode — keydown/keyup, plus blur so a release
  // missed while the window was unfocused can't leave the tool stuck on.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let zDown = false;
    let shiftHeld = false;
    const sync = () => setMode(heldZoomMode(zDown, shiftHeld));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftHeld = true;
        sync();
        return;
      }
      if (e.code !== 'KeyZ' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) {
        return;
      }
      e.preventDefault();
      zDown = true;
      shiftHeld = e.shiftKey;
      sync();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftHeld = false;
      } else if (e.code === 'KeyZ') {
        zDown = false;
      } else {
        return;
      }
      sync();
    };
    const reset = () => {
      zDown = false;
      shiftHeld = false;
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
  }, [enabled, setMode]);

  useEffect(() => {
    if (!(enabled && mode)) {
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
      const next = clampValue(getZoom() * (mode === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_ZOOM, MAX_ZOOM);
      setCenter(point.x, point.y, { zoom: next, duration: 200 });
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [enabled, mode, screenToFlowPosition, getZoom, setCenter]);

  return null;
}

// Fit the whole diagram into view once the nodes have been MEASURED. React Flow's `fitView` prop
// fits on first paint — before custom nodes report their size — so the initial fit is wrong and the
// canvas lands zoomed into the top-left. Waiting for `useNodesInitialized` fits accurately. Fires
// once per mount (so returning to the lane re-centers, but editing mid-session doesn't yank the view).
function FitOnInit({ enabled }: { enabled: boolean }) {
  const initialized = useNodesInitialized();
  const paneWidth = useStore((s) => s.width);
  const { fitView } = useReactFlow();
  const fittedRef = useRef(false);
  useEffect(() => {
    // Wait for both the nodes to be measured AND the pane to have real dimensions — fitting into a
    // 0×0 pane (mid lane-mount / rail animation) is what left it zoomed into the corner.
    if (enabled && initialized && paneWidth > 0 && !fittedRef.current) {
      fittedRef.current = true;
      fitView({ padding: 0.2, maxZoom: 1 });
    }
  }, [enabled, initialized, paneWidth, fitView]);
  return null;
}

// Recenters the viewport on a node when asked (command-palette "go to"). Keyed by a token so
// re-picking the same node pans again. Lives inside the ReactFlowProvider for useReactFlow.
function FocusNode({ nodeId, token, enabled }: { nodeId?: string; token?: number; enabled: boolean }) {
  const { getNodesBounds, setCenter, getZoom } = useReactFlow();
  // biome-ignore lint/correctness/useExhaustiveDependencies: token is the intentional re-trigger so re-picking the same node pans again.
  useEffect(() => {
    if (!(enabled && nodeId)) {
      return;
    }
    const bounds = getNodesBounds([nodeId]);
    if (!bounds || bounds.width === 0) {
      return;
    }
    // Keep the current zoom (clamped to a readable band) so jumping doesn't lurch the scale.
    const zoom = Math.min(Math.max(getZoom(), 0.8), 1);
    setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { duration: 300, zoom });
  }, [nodeId, token, enabled, getNodesBounds, setCenter, getZoom]);
  return null;
}

function KeepSelectionInView({
  selectedNodeId,
  enabled,
  focusToken,
}: {
  selectedNodeId?: string;
  enabled: boolean;
  focusToken?: number;
}) {
  const { getNodesBounds, getViewport, setViewport } = useReactFlow();
  // Re-runs as the canvas resizes during the rail animation; each change resets the settle
  // timer, so the nudge fires once the pane width finally stops changing.
  const paneWidth = useStore((s) => s.width);
  // A palette "go to" centers the node via FocusNode; skip this nudge for that cycle so the two
  // don't issue competing pans.
  const lastFocusToken = useRef(focusToken);

  useEffect(() => {
    // Disabled in the static (sidebar) overview, and a no-op until something is selected.
    if (!(enabled && selectedNodeId)) {
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
        setViewport({ x: x + dx, y, zoom }, { duration: 200 });
      }
    }, RAIL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [enabled, selectedNodeId, paneWidth, focusToken, getNodesBounds, getViewport, setViewport]);

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
  draftNodeIds?: ReadonlySet<string>;
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
  if (cb.draftNodeIds?.has(node.id)) {
    data.hasDraft = true;
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

// A filled chip swatch for node-borne vocabulary (the brand-accented routing condition), vs. edge line swatches.
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
          <LegendChipSwatch color="var(--color-brand)" />
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
  /** Nodes with an unapplied inspector draft — flagged on the canvas. */
  draftNodeIds?: ReadonlySet<string>;
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
  orientation = 'horizontal',
  hideControls,
  simple,
  selectedNodeId,
  selectedTargetKind,
  lintErrorsByNode,
  draftNodeIds,
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
  // The armed zoom tool (Z / Shift+Z) — drives the magnifier cursor and click-to-zoom.
  const [zoomMode, setZoomMode] = useState<ZoomMode>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useZoomCursor(zoomMode, wrapperRef);
  // Node ids committed last render; anything new this render "appears" in place and skips the
  // reposition transition (so it doesn't fly from origin).
  const previousIdsRef = useRef<ReadonlySet<string>>(new Set());
  const debouncedYaml = useDebouncedValue(configYaml, PARSE_DEBOUNCE_MS);
  const { nodes, error, showingStale } = useResilientParse(debouncedYaml, simple);

  // A node's "scope" — itself plus all descendants — so selecting/hovering a container keeps its
  // internal wiring (chains, copy/merge, fan edges) lit and focuses its branch.
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
      draftNodeIds,
      flashNodeIds,
      flashToken,
      previousIds: previousIdsRef.current,
    };
    // Inject per-node selection/lint/flash data, then fade nodes outside a selected construct's
    // scope (focusDimNodes). Both are selection-driven, so this memo (which excludes hover) stays
    // off the cheap-hover path.
    const injectedNodes = focusDimNodes(
      layout.rfNodes.map((node: Node) => injectNodeData(node, callbacks)),
      selectedNodeId,
      scopeOf
    );

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
    draftNodeIds,
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
        <PipelineFlowSkeleton error={error} />
      </div>
    );
  }

  return (
    // Compact lane: canvas is exactly as tall as its content and top-anchored, so it never
    // re-centers as the lane resizes — the surrounding lane scrolls.
    <div
      className="relative w-full"
      ref={wrapperRef}
      style={simple ? { height: contentHeight + 16 } : { height: '100%' }}
    >
      <StaleParseBanner show={showingStale} />
      <ReactFlowProvider>
        <ReactFlow
          className={staleFlowClass(showingStale)}
          defaultViewport={simple ? { x: 8, y: 8, zoom: 1 } : undefined}
          edges={rfEdges}
          edgeTypes={flowEdgeTypes}
          elementsSelectable={false}
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
          panOnDrag={canPanCanvas(simple, zoomMode)}
          panOnScroll={false}
          // The wheel scrolls the embedded page (the canvas is full-height); zoom is on the Z / Shift+Z
          // keys (see ZoomHotkeys), the Controls buttons, and trackpad pinch.
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
          {simple ? null : <PipelineMiniMap nodes={rfNodes} translateExtent={translateExtent} />}
          {/* Renders only for control-flow markers (flowSplit/flowMerge), present only on the
              full canvas — the compact sidebar gets nothing. */}
          <ScopeRegions hoveredId={hoveredNodeId} rfNodes={rfNodes} scopeOf={scopeOf} selectedId={selectedNodeId} />
          <FitOnInit enabled={!simple} />
          <KeepSelectionInView enabled={!simple} focusToken={focusToken} selectedNodeId={selectedNodeId} />
          <FocusNode enabled={!simple} nodeId={focusNodeId} token={focusToken} />
          <ZoomTool enabled={!simple} mode={zoomMode} setMode={setZoomMode} />
        </ReactFlow>
      </ReactFlowProvider>
      {simple ? null : <FlowLegend flags={legend} />}
    </div>
  );
}
