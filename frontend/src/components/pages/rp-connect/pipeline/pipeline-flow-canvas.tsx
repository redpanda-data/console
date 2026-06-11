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
} from '@xyflow/react';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import { useCallback, useMemo, useState } from 'react';

import type { FlowCardData } from './pipeline-flow-canvas-nodes';
import { flowEdgeTypes, flowNodeTypes } from './pipeline-flow-canvas-nodes';
import { PipelineFlowSkeleton } from './pipeline-flow-nodes';
import { computeFlowLayout, type FlowOrientation, parsePipelineFlowTree } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const PARSE_DEBOUNCE_MS = 300;
// How far past the diagram bounds the canvas may be panned, and the zoom range.
const PAN_PADDING = 240;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.25;

type CanvasCallbacks = {
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  collapsedIds: ReadonlySet<string>;
  toggleCollapse: (nodeId: string) => void;
  selectedNodeId?: string;
  lintErrorsByNode?: Map<string, string[]>;
};

// Wire interactivity into a layout node's data: collapse toggle, selection
// highlight, and the add-connector / redpanda setup-hint handlers. Editing now
// happens in the inspector rail (selection), not via a per-node button.
function injectNodeData(node: Node, cb: CanvasCallbacks): Node {
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
  if (data.label === 'none' && cb.onAddConnector) {
    data.onAddConnector = cb.onAddConnector;
  }
  if (data.missingTopic && cb.onAddTopic) {
    data.onAddTopic = cb.onAddTopic;
  }
  if (data.missingSasl && cb.onAddSasl) {
    data.onAddSasl = cb.onAddSasl;
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
          <LegendSwatch color="var(--color-border)" dashed />
          Uses resource
        </div>
      ) : null}
    </div>
  );
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
  /** Select a node by id + its edit target (clicking a node). */
  onSelectNode?: (nodeId: string, target: EditTarget) => void;
  /** Clear the selection (clicking empty canvas). */
  onClearSelection?: () => void;
  // Edit-mode callbacks. When omitted the canvas is a read-only viewer.
  onInsert?: (processorIndex: number) => void;
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
  onSelectNode,
  onClearSelection,
  onInsert,
  onAddConnector,
  onAddTopic,
  onAddSasl,
}: PipelineFlowCanvasProps) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
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

  const { rfNodes, rfEdges, translateExtent, contentHeight, legend } = useMemo(() => {
    const layout = computeFlowLayout(nodes, collapsedIds, orientation, simple);

    const callbacks: CanvasCallbacks = {
      onAddConnector,
      onAddTopic,
      onAddSasl,
      collapsedIds,
      toggleCollapse,
      selectedNodeId,
      lintErrorsByNode,
    };
    const injectedNodes = layout.rfNodes.map((node: Node) => injectNodeData(node, callbacks));

    const injectedEdges = onInsert
      ? layout.rfEdges.map((edge: Edge) =>
          edge.type === 'flowSpine'
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  onInsert: () => onInsert((edge.data as { insertIndex?: number })?.insertIndex ?? 0),
                },
              }
            : edge
        )
      : layout.rfEdges;

    // The compact sidebar scrolls vertically and should hug the content (just a
    // little breathing room); the full canvas allows generous panning room.
    const pad = simple ? 16 : PAN_PADDING;
    const extent: [[number, number], [number, number]] = [
      [-pad, -pad],
      [layout.width + pad, layout.height + pad],
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
      rfEdges: injectedEdges,
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
    onInsert,
    onAddConnector,
    onAddTopic,
    onAddSasl,
  ]);

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
                  const target = (node.data as FlowCardData).editTarget;
                  if (target) {
                    onSelectNode?.(node.id, target);
                  }
                }
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
          {hideControls || simple ? null : <Controls position="bottom-right" showInteractive={false} />}
        </ReactFlow>
      </ReactFlowProvider>
      {simple ? null : <FlowLegend flags={legend} />}
    </div>
  );
}
