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
  onEditNode?: (target: EditTarget) => void;
  onDeleteNode?: (target: EditTarget) => void;
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  collapsedIds: ReadonlySet<string>;
  toggleCollapse: (nodeId: string) => void;
};

// Wire interactivity into a layout node's data: collapse toggle, edit/remove for
// editable nodes, and the add-connector / redpanda setup-hint handlers.
function injectNodeData(node: Node, cb: CanvasCallbacks): Node {
  const data = { ...node.data } as FlowCardData;
  if (data.collapsible) {
    data.collapsed = cb.collapsedIds.has(node.id);
    data.onToggle = () => cb.toggleCollapse(node.id);
  }
  if (data.editTarget && cb.onEditNode) {
    const target = data.editTarget;
    data.onEdit = () => cb.onEditNode?.(target);
  }
  if (data.editTarget && cb.onDeleteNode) {
    const target = data.editTarget;
    data.onDelete = () => cb.onDeleteNode?.(target);
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

type PipelineFlowCanvasProps = {
  configYaml: string;
  /** Main-axis direction: 'horizontal' for the Visual lane, 'vertical' for the compact sidebar. */
  orientation?: FlowOrientation;
  /** Hide the zoom controls (used by the compact sidebar). */
  hideControls?: boolean;
  /** Static overview: no background dots, no pan/zoom — just a fit-to-view diagram (sidebar). */
  simple?: boolean;
  // Edit-mode callbacks. When omitted the canvas is a read-only viewer.
  onEditNode?: (target: EditTarget) => void;
  onDeleteNode?: (target: EditTarget) => void;
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
  onEditNode,
  onDeleteNode,
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

  const { rfNodes, rfEdges, translateExtent, contentHeight } = useMemo(() => {
    const layout = computeFlowLayout(nodes, collapsedIds, orientation, simple);

    const callbacks: CanvasCallbacks = {
      onEditNode,
      onDeleteNode,
      onAddConnector,
      onAddTopic,
      onAddSasl,
      collapsedIds,
      toggleCollapse,
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

    return { rfNodes: injectedNodes, rfEdges: injectedEdges, translateExtent: extent, contentHeight: layout.height };
  }, [
    nodes,
    collapsedIds,
    orientation,
    simple,
    toggleCollapse,
    onEditNode,
    onDeleteNode,
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
    <div className="w-full" style={simple ? { height: contentHeight + 16 } : { height: '100%' }}>
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
          panOnDrag={!simple}
          panOnScroll={false}
          preventScrolling={!simple}
          proOptions={{ hideAttribution: true }}
          translateExtent={simple ? undefined : translateExtent}
          zoomOnDoubleClick={!simple}
          zoomOnPinch={!simple}
          zoomOnScroll={!simple}
        >
          {simple ? null : <Background gap={20} size={1.5} variant={BackgroundVariant.Dots} />}
          {hideControls || simple ? null : <Controls position="bottom-right" showInteractive={false} />}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
