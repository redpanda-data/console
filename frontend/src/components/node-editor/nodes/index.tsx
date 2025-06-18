import type { Node, NodeProps, XYPosition } from '@xyflow/react';
import { nanoid } from 'nanoid';

import { BranchNode } from '@/components/node-editor/nodes/branch-node';
import { JoinNode } from '@/components/node-editor/nodes/join-node';
import { type AppNode, NODE_SIZE, nodesConfig } from '@/components/node-editor/nodes/nodes-config';
import type { AppNodeType } from '@/components/node-editor/nodes/nodes-config';
import { RedpandaBufferNode } from '@/components/node-editor/nodes/redpanda-buffer-node';
import { RedpandaCacheNode } from '@/components/node-editor/nodes/redpanda-cache-node';
import { RedpandaInputNode } from '@/components/node-editor/nodes/redpanda-input-node';
import { RedpandaOutputNode } from '@/components/node-editor/nodes/redpanda-output-node';
import { RedpandaProcessorNode } from '@/components/node-editor/nodes/redpanda-processor-node';
import { RedpandaRateLimitNode } from '@/components/node-editor/nodes/redpanda-rate-limit-node';
import { RedpandaScannerNode } from '@/components/node-editor/nodes/redpanda-scanner-node';
import { TransformNode } from '@/components/node-editor/nodes/transform-node';
import type { SchemaNodeConfig } from '@/components/node-editor/redpanda-connect/schema-loader';
import { Position } from '@xyflow/react';

/* WORKFLOW NODE DATA PROPS ------------------------------------------------------ */

export type WorkflowNodeData = {
  title?: string;
  label?: string;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
  status?: 'loading' | 'success' | 'error' | 'initial';
  schemaConfig?: SchemaNodeConfig; // Make this optional for compatibility
} & Record<string, unknown>;

export type WorkflowNodeProps = NodeProps<Node<WorkflowNodeData>> & {
  type: AppNodeType;
  children?: React.ReactNode;
};

export type NodeConfig = {
  id: AppNodeType;
  title: string;
  status?: 'loading' | 'success' | 'error' | 'initial';
  handles: NonNullable<Node['handles']>;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
};

export const nodeTypes = {
  'transform-node': TransformNode,
  'branch-node': BranchNode,
  'join-node': JoinNode,
  'redpanda-input-node': RedpandaInputNode,
  'redpanda-output-node': RedpandaOutputNode,
  'redpanda-processor-node': RedpandaProcessorNode,
  'redpanda-cache-node': RedpandaCacheNode,
  'redpanda-buffer-node': RedpandaBufferNode,
  'redpanda-rate-limit-node': RedpandaRateLimitNode,
  'redpanda-scanner-node': RedpandaScannerNode,
};

export function createNodeByType({
  type,
  id,
  position = { x: 0, y: 0 },
  data,
}: {
  type: AppNodeType;
  id?: string;
  position?: XYPosition;
  data?: WorkflowNodeData;
}): AppNode {
  const node = nodesConfig[type];

  const newNode: AppNode = {
    id: id ?? nanoid(),
    data: data ?? {
      title: node.title,
      status: node.status,
      icon: node.icon,
    },
    position: {
      x: position.x - NODE_SIZE.width * 0.5,
      y: position.y - NODE_SIZE.height * 0.5,
    },
    type,
  };

  return newNode;
}

export function createRedpandaNode({
  schemaConfig,
  id,
  position = { x: 0, y: 0 },
}: {
  schemaConfig: SchemaNodeConfig;
  id?: string;
  position?: XYPosition;
}): AppNode {
  // Determine node type and handles based on category
  let nodeType: AppNodeType = 'redpanda-node';
  let handles: NonNullable<Node['handles']> = [
    {
      type: 'target',
      position: Position.Top,
      x: NODE_SIZE.width * 0.5,
      y: 0,
    },
    {
      type: 'source',
      position: Position.Bottom,
      x: NODE_SIZE.width * 0.5,
      y: NODE_SIZE.height,
    },
  ];

  // Determine specific node type based on category
  switch (schemaConfig.category) {
    case 'input':
      nodeType = 'redpanda-input-node';
      handles = [
        {
          type: 'source',
          position: Position.Bottom,
          x: NODE_SIZE.width * 0.5,
          y: NODE_SIZE.height,
        },
      ];
      break;
    case 'output':
      nodeType = 'redpanda-output-node';
      handles = [
        {
          type: 'target',
          position: Position.Top,
          x: NODE_SIZE.width * 0.5,
          y: 0,
        },
      ];
      break;
    case 'processor':
      nodeType = 'redpanda-processor-node';
      break;
    case 'cache':
      nodeType = 'redpanda-cache-node';
      break;
    case 'buffer':
      nodeType = 'redpanda-buffer-node';
      break;
    case 'rate_limit':
      nodeType = 'redpanda-rate-limit-node';
      break;
    case 'scanner':
      nodeType = 'redpanda-scanner-node';
      break;
  }

  const newNode: AppNode = {
    id: id ?? nanoid(),
    data: {
      schemaConfig,
      title: schemaConfig.name,
      status: 'initial',
    },
    position: {
      x: position.x - NODE_SIZE.width * 0.5,
      y: position.y - NODE_SIZE.height * 0.5,
    },
    type: nodeType,
    handles,
  };

  return newNode;
}
