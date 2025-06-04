'use client';

import { Background, ConnectionLineType, ReactFlow } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';

import { WorkflowEdge } from '@/components/node-editor/edges/workflow-edge';
import { useLayout } from '@/components/node-editor/hooks/use-layout';
import { nodeTypes } from '@/components/node-editor/nodes';
import { useAppStore } from '@/components/node-editor/store';
import { WorkflowControls } from '@/components/node-editor/workflow/controls';
import { useDragAndDrop } from '@/components/node-editor/workflow/use-drag-and-drop';

const edgeTypes = {
  workflow: WorkflowEdge,
};

const defaultEdgeOptions = { type: 'workflow' };

export default function Workflow() {
  const { nodes, edges, colorMode, onNodesChange, onEdgesChange, onConnect, onNodeDragStart, onNodeDragStop } =
    useAppStore(
      useShallow((state) => ({
        nodes: state.nodes,
        edges: state.edges,
        colorMode: state.colorMode,
        onNodesChange: state.onNodesChange,
        onEdgesChange: state.onEdgesChange,
        onConnect: state.onConnect,
        onNodeDragStart: state.onNodeDragStart,
        onNodeDragStop: state.onNodeDragStop,
      })),
    );

  const { onDragOver, onDrop } = useDragAndDrop();
  const runLayout = useLayout(true);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      connectionLineType={ConnectionLineType.SmoothStep}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onInit={runLayout}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      colorMode={colorMode}
      defaultEdgeOptions={defaultEdgeOptions}
    >
      <Background />
      <WorkflowControls />
    </ReactFlow>
  );
}
