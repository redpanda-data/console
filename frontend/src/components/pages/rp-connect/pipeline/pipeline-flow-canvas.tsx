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
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { useThemeAppearance } from 'hooks/use-theme-appearance';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  animMs,
  FitOnInit,
  type FlowExtent,
  FlowLegend,
  fitMinZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  PipelineMiniMap,
  reportViewportMoveFailure,
  type ScopeBounds,
  type ZoomMode,
  ZoomTool,
} from './canvas-controls';
import { InvalidConfigNotice } from './invalid-config-notice';
import type { FlowCardData } from './pipeline-flow-canvas-nodes';
import { flowEdgeTypes, flowNodeTypes } from './pipeline-flow-canvas-nodes';
import { PipelineFlowSkeleton } from './pipeline-flow-skeleton';
import { useResilientParse } from './use-resilient-parse';
import { isNonEmptyString } from '../../../../utils/string-utils';
import { isPresent } from '../../../../utils/type-guards';
import {
  computeGraphLayout,
  type FlowEdge as Edge,
  type FlowInsertPayload,
  type FlowNode as Node,
} from '../utils/pipeline-flow-layout';
import type { PipelineFlowNode } from '../utils/pipeline-flow-nodes';
import { buildChildrenMap } from '../utils/pipeline-flow-parser';
import type { StopConditionDraft } from '../utils/read-until';
import type { EditTarget } from '../utils/yaml-edit-target';
import './pipeline-editor.css';

import { growBounds, type MeasuredById, nodeInScope, nodeRect, ScopeRegions } from './pipeline-scope-regions';

const PARSE_DEBOUNCE_MS = 300;

// The first change after a quiet spell applies at once, so a visual edit shows on the canvas as it
// lands; during a burst the latest value applies at most once per `delay`, and always last.
function useLeadingDebouncedValue<T>(value: T, delay: number): T {
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
// How far past the diagram the canvas may be panned, so an edge node can be brought to the middle.
const PAN_PADDING = 240;

// Bounding box of top-level nodes at their layout size; measured (not assumed from origin) since
// resource cards can sit at negative x.
function contentBounds(nodes: Node[]): ScopeBounds {
  const layoutSizeOnly: MeasuredById = new Map();
  const box = nodes
    .filter((node) => !isNonEmptyString(node.parentId))
    .reduce<ScopeBounds | null>((acc, node) => growBounds(acc, nodeRect(node, layoutSizeOnly)), null);
  return box ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

// Reveal margin (px), and how long to wait for the inspector rail's open animation before measuring.
const SELECTION_REVEAL_MARGIN = 32;
const RAIL_SETTLE_MS = 240;

// Selecting a control-flow construct focuses its branch: nodes outside its scope fade back so its members read clearly.
function focusDimNodes(
  rfNodes: Node[],
  selectedNodeId: string | undefined,
  scopeOf: (id: string | undefined) => ReadonlySet<string> | undefined
): Node[] {
  const selectedNode =
    selectedNodeId !== null && selectedNodeId !== undefined && selectedNodeId !== ''
      ? rfNodes.find((n) => n.id === selectedNodeId)
      : undefined;
  const focus = selectedNode?.type === 'flowSplit' ? scopeOf(selectedNodeId) : undefined;
  if (!focus) {
    return rfNodes;
  }
  return rfNodes.map((node) =>
    nodeInScope(node, focus)
      ? node
      : {
          ...node,
          style: { ...node.style, opacity: 0.3, transition: 'opacity 200ms ease' },
        }
  );
}

// The graph fades back while it's showing the stale (last-good) layout, cueing that it's not live.
const staleFlowClass = (stale: boolean): string => `transition-opacity duration-200 ${stale ? 'opacity-60' : ''}`;

// Centred over the top of the canvas, above the graph; the `floating` variant owns its look.
const CANVAS_NOTICE_POSITION = 'absolute top-3 left-1/2 z-20 -translate-x-1/2';

// Banner shown while rendering the last-good graph for invalid YAML (see useResilientParse).
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
    if (!(nodeId !== null && nodeId !== undefined && nodeId !== '')) {
      return;
    }
    const bounds = getNodesBounds([nodeId]);
    if (bounds.width === 0) {
      return;
    }
    // Keep the current zoom (clamped to a readable band) so jumping doesn't lurch the scale.
    const zoom = Math.min(Math.max(getZoom(), 0.8), 1);
    // Long ease so the pan reads as a glide, not a jump.
    setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { duration: animMs(600), zoom }).catch(
      reportViewportMoveFailure
    );
  }, [nodeId, token, getNodesBounds, setCenter, getZoom]);
  return null;
}

// Horizontal pan (screen px) that brings a node's box inside the reveal margins; 0 when it's in view.
function revealPanDx(
  bounds: { x: number; width: number },
  viewport: { x: number; zoom: number },
  paneWidth: number
): number {
  const screenLeft = bounds.x * viewport.zoom + viewport.x;
  const screenRight = (bounds.x + bounds.width) * viewport.zoom + viewport.x;
  if (screenRight > paneWidth - SELECTION_REVEAL_MARGIN) {
    // Off the right edge / behind the rail — pan content left to reveal it.
    return paneWidth - SELECTION_REVEAL_MARGIN - screenRight;
  }
  if (screenLeft < SELECTION_REVEAL_MARGIN) {
    return SELECTION_REVEAL_MARGIN - screenLeft;
  }
  return 0;
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
    if (!(selectedNodeId !== null && selectedNodeId !== undefined && selectedNodeId !== '')) {
      return;
    }
    if (focusToken !== lastFocusToken.current) {
      lastFocusToken.current = focusToken;
      return;
    }
    const timer = setTimeout(() => {
      const bounds = getNodesBounds([selectedNodeId]);
      if (bounds.width === 0) {
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

// Edit-mode fixes for a card's missing pieces: an empty section, a missing topic or SASL user.
function wireConnectorActions(data: FlowCardData, cb: CanvasCallbacks): void {
  if (data.label === 'none' && cb.onAddConnector) {
    data.onAddConnector = cb.onAddConnector;
  }
  if (data.missingTopic === true && cb.onAddTopic) {
    data.onAddTopic = cb.onAddTopic;
  }
  if (data.missingSasl === true && cb.onAddSasl) {
    data.onAddSasl = cb.onAddSasl;
  }
}

// Edit-mode inserts: a container's "add child" action and an insert slot's (+).
function wireInsertActions(data: FlowCardData, node: Node, cb: CanvasCallbacks): void {
  if (data.addAction && cb.onSlotInsert) {
    const payload = data.addAction.payload;
    data.onAddChild = () => cb.onSlotInsert?.(payload);
  }
  if (data.stopSlot && cb.onSetStopCondition) {
    const setStop = cb.onSetStopCondition;
    data.onSetStopCondition = (draft) => setStop(node.id, draft);
  }
  if (node.type === 'flowInsert' && cb.onSlotInsert) {
    data.onInsert = cb.onSlotInsert;
  }
}

// Collapse toggle and the selection ring.
function applyInteractionState(data: FlowCardData, node: Node, cb: CanvasCallbacks): void {
  if (data.collapsible === true) {
    data.collapsed = cb.collapsedIds.has(node.id);
    data.onToggle = () => cb.toggleCollapse(node.id);
  }
  if (isNonEmptyString(cb.selectedNodeId) && node.id === cb.selectedNodeId) {
    // The target kind picks whether to ring the condition row (case) or the whole card (component).
    if (data.caseEditTarget && cb.selectedTargetKind === 'switchCase') {
      data.conditionSelected = true;
    } else {
      data.selected = true;
    }
  }
}

// Lint and deprecation badges.
function applyIssueBadges(data: FlowCardData, node: Node, cb: CanvasCallbacks): void {
  const lintErrors = cb.lintErrorsByNode?.get(node.id);
  if (isPresent(lintErrors) && lintErrors.length > 0) {
    data.lintErrors = lintErrors;
  }
  const deprecations = cb.deprecationsByNode?.get(node.id);
  if (isPresent(deprecations) && deprecations.length > 0) {
    data.deprecations = deprecations;
  }
}

// Issue badges, the unsaved dot, and the undo/redo pulse.
function applyStatusMarks(data: FlowCardData, node: Node, cb: CanvasCallbacks): void {
  applyIssueBadges(data, node, cb);
  // A condition edit is attributed to the non-rendered case-wrapper node — also mark its stand-in entry card.
  if (
    cb.unsavedNodeIds?.has(node.id) === true ||
    (isNonEmptyString(data.caseOwnerId) && cb.unsavedNodeIds?.has(data.caseOwnerId) === true)
  ) {
    data.unsaved = true;
  }
  if (cb.flashNodeIds?.has(node.id) === true) {
    data.flash = true;
    data.flashToken = cb.flashToken;
  }
}

export function injectNodeData(node: Node, cb: CanvasCallbacks): Node {
  const data = { ...node.data };
  applyInteractionState(data, node, cb);
  applyStatusMarks(data, node, cb);
  wireConnectorActions(data, cb);
  wireInsertActions(data, node, cb);
  // New nodes appear in place: drop the transform transition so they snap, then fade + grow in (`appeared`).
  if (!cb.previousIds.has(node.id)) {
    data.appeared = true;
    return {
      ...node,
      data,
      style: { ...node.style, transition: undefined },
    };
  }
  return { ...node, data };
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

// A graph edge's insert (+) handler: a top-level processor index, or a nested slot payload.
function withInsertHandler(edge: Edge, { onInsert, onSlotInsert }: DecorateEdgeOptions): Edge {
  const edgeData = edge.data;
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

// A routing-condition label that selects its case to edit the condition.
function withLabelClick(edge: Edge, onSelectNode: DecorateEdgeOptions['onSelectNode']): Edge {
  const edgeData = edge.data;
  if (!(onSelectNode && isNonEmptyString(edgeData?.selectId) && edgeData.selectTarget)) {
    return edge;
  }
  const { selectId, selectTarget } = edgeData;
  return { ...edge, data: { ...edge.data, onLabelClick: () => onSelectNode(selectId, selectTarget) } };
}

// Per-render edge styling: reference edges stay faint until an endpoint is active; a selection
// emphasizes its own edges and dims the rest; graph edges get their insert (+) handler.
export function decorateEdges(edges: Edge[], options: DecorateEdgeOptions): Edge[] {
  const { selectedScope, hoveredScope } = options;
  const activeScope = selectedScope ?? hoveredScope;
  return edges.map((edge) => {
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

// What a click selects: the node itself if editable, else the nearest selectable ancestor
// (structural sub-nodes like switch cases have no `editTarget`).
export function selectionTargetForNode(
  node: Node,
  nodes: Node[]
): { id: string; target: EditTarget; caseTarget?: EditTarget } | null {
  let current: Node | undefined = node;
  while (current && !current.data.editTarget) {
    // Nodes are positioned absolutely (no RF parentId), so walk the logical owner in `data.ownerId`.
    const ownerId: string | undefined = current.parentId ?? current.data.ownerId;
    current =
      ownerId !== null && ownerId !== undefined && ownerId !== '' ? nodes.find((n) => n.id === ownerId) : undefined;
  }
  const target = current?.data.editTarget;
  if (!(current && target)) {
    return null;
  }
  // A case-entry node also carries its routing-condition target so the inspector can edit the condition too.
  const caseTarget = current.data.caseEditTarget;
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
  // Edit-mode callbacks. When omitted the canvas is a read-only viewer.
  onInsert?: (processorIndex: number) => void;
  onSlotInsert?: (payload: FlowInsertPayload) => void;
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  /** Set or clear an input's stop condition (`read_until`) from its card's stop row. */
  onSetStopCondition?: (nodeId: string, draft: StopConditionDraft | null) => boolean;
};

// Layout-derived canvas geometry: the Dagre pass plus its pan extent, size and legend vocabulary.
function layoutCanvasGraph(nodes: PipelineFlowNode[], editable: boolean) {
  const layout = computeGraphLayout(nodes, editable);

  const margin = PAN_PADDING;
  const bounds = contentBounds(layout.rfNodes);
  const extent: FlowExtent = [
    [bounds.minX - margin, bounds.minY - margin],
    [bounds.maxX + margin, bounds.maxY + margin],
  ];

  // Which vocabularies appear — drives the adaptive legend (trivial pipelines stay legend-free).
  const legendFlags = {
    condition: layout.rfNodes.some((n: Node) => Boolean(n.data?.caseEditTarget)),
    error: layout.rfEdges.some((e: Edge) => e.data?.tone === 'error'),
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

// try marker → its fused catch marker (from the `error-<try>-<catch>` edge) so a try's region folds in its catch.
function tryCatchPairsOf(layoutEdges: Edge[]): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const edge of layoutEdges) {
    if (edge.id.startsWith('error-')) {
      pairs.set(edge.source, edge.target);
    }
  }
  return pairs;
}

// Parses (debounced, holding the last good graph) and lays out the YAML, plus each node's scope.
function useCanvasGraph(configYaml: string, editable: boolean) {
  const debouncedYaml = useLeadingDebouncedValue(configYaml, PARSE_DEBOUNCE_MS);
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
        const children = childrenByParent.get(queue.pop()) ?? [];
        for (const child of children) {
          scope.add(child.id);
          queue.push(child.id);
        }
      }
      return scope;
    },
    [childrenByParent]
  );

  // Expensive layout memo: the full Dagre pass plus everything derived from its geometry (pan
  // extent, legend). Keyed only on parsed nodes + edit mode, so decoration changes never re-run layout.
  const layout = useMemo(() => layoutCanvasGraph(nodes, editable), [nodes, editable]);
  const tryCatchPairs = useMemo(() => tryCatchPairsOf(layout.layoutEdges), [layout.layoutEdges]);
  return { ...layout, error, showingStale, scopeOf, tryCatchPairs };
}

// The zoom tool's armed mode and the interactive zoom-out floor, with the magnifier cursor painted
// on the returned wrapper.
function useCanvasZoom() {
  // The armed zoom tool (Z / Option+Z) — drives the magnifier cursor and click-to-zoom.
  const [zoomMode, setZoomMode] = useState<ZoomMode>(null);
  // Interactive zoom-out floor — lowered for graphs too big to fit at MIN_ZOOM (MinZoomController).
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

// A new node object without `measured` makes React Flow drop its handle bounds, and edges skip the
// node until it re-measures, which a node that never resizes may never do. So every rebuilt node
// carries the size React Flow last measured for it.
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

// Per-render node decoration (selection, lint, unsaved, collapse, edit actions) over the laid-out
// nodes, owning the collapse state and which nodes are new since the last commit.
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
}: DecoratedNodesOptions): Node[] {
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
  // Node ids committed last render — anything new this render "appears" in place (see injectNodeData).
  const previousIdsRef = useRef<ReadonlySet<string>>(new Set());

  // Cheap decoration memo, keyed on decoration inputs only — a click re-runs this, not the Dagre
  // layout. Hover is excluded to stay on the cheap edges-only path.
  const rfNodes = useMemo(() => {
    const callbacks: CanvasCallbacks = {
      onAddConnector,
      onAddTopic,
      onAddSasl,
      onSlotInsert,
      // A stale layout's paths may no longer match the YAML, so its stop conditions are read-only.
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

  // Record the committed node ids so the next render can tell which nodes are new.
  useEffect(() => {
    previousIdsRef.current = new Set(rfNodes.map((node) => node.id));
  }, [rfNodes]);

  return rfNodes;
}

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
  // Hovering a node lights up its (otherwise faint) resource-reference edges.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();
  const { wrapperRef, zoomMode, setZoomMode, minZoom, setMinZoom } = useCanvasZoom();
  // Must be told: react-flow stamps a bare `light`/`dark` class, and its `light` default re-declares
  // the light palette over the whole subtree.
  const appearance = useThemeAppearance();
  // Layout keys on this stable boolean, not the callback identity — else an ancestor re-creating
  // onSlotInsert would re-run the Dagre pass.
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
      <div className="relative size-full">
        {/* Parse error with no last-good graph: keep the notice up (no dismiss) and point at the fix. */}
        {error !== null && error !== undefined && error !== '' ? (
          <InvalidConfigNotice className={CANVAS_NOTICE_POSITION} variant="floating">
            Unable to visualize this pipeline — fix the YAML in the YAML tab.
          </InvalidConfigNotice>
        ) : null}
        {/* Freeze the skeleton under an error (it's a backdrop, not a loading state). */}
        <div
          className={error !== null && error !== undefined && error !== '' ? 'opacity-40 **:animate-none!' : undefined}
        >
          <PipelineFlowSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="relative size-full" ref={wrapperRef}>
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
          // Only clear when leaving the tracked node: crossing into a nested child fires
          // enter(child) then leave(parent), which must not wipe the child's hover.
          onNodeMouseLeave={(_, node) => setHoveredNodeId((prev) => (prev === node.id ? undefined : prev))}
          onNodesChange={onNodesChange}
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
          <Controls position="bottom-right" showInteractive={false} />
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
