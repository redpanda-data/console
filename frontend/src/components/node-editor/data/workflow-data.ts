import { type AppEdge, createEdge } from '@/components/node-editor/edges';
import { createNodeByType } from '@/components/node-editor/nodes';
import type { AppNode } from '@/components/node-editor/nodes/nodes-config';

export const initialNodes: AppNode[] = [
  createNodeByType({ type: 'initial-node', id: 'workflowNode_1' }),
  createNodeByType({ type: 'branch-node', id: 'workflowNode_2' }),
  createNodeByType({ type: 'transform-node', id: 'workflowNode_3' }),
  createNodeByType({ type: 'output-node', id: 'workflowNode_4' }),
  createNodeByType({ type: 'output-node', id: 'workflowNode_5' }),
  createNodeByType({ type: 'branch-node', id: 'workflowNode_6' }),
  createNodeByType({ type: 'transform-node', id: 'workflowNode_7' }),
  createNodeByType({ type: 'transform-node', id: 'workflowNode_8' }),
];

export const initialEdges: AppEdge[] = [
  createEdge('workflowNode_1', 'workflowNode_2'),
  createEdge('workflowNode_2', 'workflowNode_3', 'true'),
  createEdge('workflowNode_3', 'workflowNode_4'),
  createEdge('workflowNode_2', 'workflowNode_5', 'false'),
  createEdge('workflowNode_6', 'workflowNode_7', 'true'),
  createEdge('workflowNode_6', 'workflowNode_8', 'false'),
];
