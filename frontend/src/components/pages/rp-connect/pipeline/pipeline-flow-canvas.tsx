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
import { computeFlowLayout, parsePipelineFlowTree } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const PARSE_DEBOUNCE_MS = 300;

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

  const { rfNodes, rfEdges } = useMemo(() => {
    const layout = computeFlowLayout(nodes, collapsedIds);

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

    return { rfNodes: injectedNodes, rfEdges: injectedEdges };
  }, [nodes, collapsedIds, toggleCollapse, onEditNode, onDeleteNode, onInsert, onAddConnector, onAddTopic, onAddSasl]);

  if (rfNodes.length === 0) {
    return (
      <div className="relative h-full w-full">
        <PipelineFlowSkeleton error={error} />
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <ReactFlow
          edges={rfEdges}
          edgeTypes={flowEdgeTypes}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          maxZoom={1.5}
          minZoom={0.3}
          nodes={rfNodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          nodeTypes={flowNodeTypes}
          panOnDrag
          panOnScroll={false}
          proOptions={{ hideAttribution: true }}
          zoomOnScroll
        >
          <Background gap={20} size={1.5} variant={BackgroundVariant.Dots} />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
