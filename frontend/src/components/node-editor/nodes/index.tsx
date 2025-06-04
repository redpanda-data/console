import type { Node, NodeProps, XYPosition } from '@xyflow/react';
import { nanoid } from 'nanoid';

import type { iconMapping } from '@/components/node-editor/data/icon-mapping';

import { BranchNode } from '@/components/node-editor/nodes/branch-node';
import { InitialNode } from '@/components/node-editor/nodes/initial-node';
import { JoinNode } from '@/components/node-editor/nodes/join-node';
import { type AppNode, NODE_SIZE, nodesConfig } from '@/components/node-editor/nodes/nodes-config';
import { OutputNode } from '@/components/node-editor/nodes/output-node';
import { TransformNode } from '@/components/node-editor/nodes/transform-node';
import type { AppNodeType } from '@/components/node-editor/nodes/nodes-config';

/* WORKFLOW NODE DATA PROPS ------------------------------------------------------ */

export type WorkflowNodeData = {
  title?: string;
  label?: string;
  icon?: keyof typeof iconMapping;
  status?: 'loading' | 'success' | 'error' | 'initial';
};

export type WorkflowNodeProps = NodeProps<Node<WorkflowNodeData>> & {
  type: AppNodeType;
  children?: React.ReactNode;
};

export type NodeConfig = {
  id: AppNodeType;
  title: string;
  status?: 'loading' | 'success' | 'error' | 'initial';
  handles: NonNullable<Node['handles']>;
  icon: keyof typeof iconMapping;
};

export const nodeTypes = {
  'initial-node': InitialNode,
  'output-node': OutputNode,
  'transform-node': TransformNode,
  'branch-node': BranchNode,
  'join-node': JoinNode,
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
