import {
  Cpu,
  Database,
  FileInput,
  FileOutput,
  Layers,
  Merge,
  Search,
  Spline,
  Split,
  Timer,
} from 'lucide-react';
import type { NodeConfig, WorkflowNodeData } from '@/components/node-editor/nodes';
import { Position } from '@xyflow/react';
import type { Node } from '@xyflow/react';

export const NODE_SIZE = { width: 340, height: 50 };

export type AppNodeType = NonNullable<AppNode['type']>;

export type AppNode = Node<WorkflowNodeData>;

export const nodesConfig: Record<AppNodeType, NodeConfig> = {
  'transform-node': {
    id: 'transform-node',
    title: 'Transform Node',
    handles: [
      {
        id: 'output',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width * 0.5,
        y: NODE_SIZE.height,
      },
      {
        id: 'input',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width * 0.5,
        y: 0,
      },
    ],
    icon: Spline,
  },
  'join-node': {
    id: 'join-node',
    title: 'Join Node',
    status: 'initial',
    handles: [
      {
        id: 'true',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width - 25,
        y: 0,
      },
      {
        id: 'false',
        type: 'target',
        position: Position.Top,
        x: 25,
        y: 0,
      },
      {
        id: 'output',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width * 0.5,
        y: NODE_SIZE.height,
      },
    ],
    icon: Split,
  },
  'branch-node': {
    id: 'branch-node',
    title: 'Branch Node',
    status: 'initial',
    handles: [
      {
        id: 'input',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width * 0.5,
        y: 0,
      },
      {
        id: 'true',
        type: 'source',
        position: Position.Bottom,
        x: 25,
        y: NODE_SIZE.height,
      },
      {
        id: 'false',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width - 25,
        y: NODE_SIZE.height,
      },
    ],
    icon: Merge,
  },
  'redpanda-input-node': {
    id: 'redpanda-input-node',
    title: 'Input Node',
    handles: [
      {
        id: 'output',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width * 0.5,
        y: NODE_SIZE.height,
      },
    ],
    icon: FileInput,
  },
  'redpanda-output-node': {
    id: 'redpanda-output-node',
    title: 'Output Node',
    handles: [
      {
        id: 'input',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width * 0.5,
        y: 0,
      },
    ],
    icon: FileOutput,
  },
  'redpanda-processor-node': {
    id: 'redpanda-processor-node',
    title: 'Processor Node',
    handles: [
      {
        id: 'input',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width * 0.5,
        y: 0,
      },
      {
        id: 'output',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width * 0.5,
        y: NODE_SIZE.height,
      },
    ],
    icon: Cpu,
  },
  'redpanda-cache-node': {
    id: 'redpanda-cache-node',
    title: 'Cache Node',
    handles: [
      {
        id: 'input',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width * 0.5,
        y: 0,
      },
      {
        id: 'output',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width * 0.5,
        y: NODE_SIZE.height,
      },
    ],
    icon: Database,
  },
  'redpanda-buffer-node': {
    id: 'redpanda-buffer-node',
    title: 'Buffer Node',
    handles: [
      {
        id: 'input',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width * 0.5,
        y: 0,
      },
      {
        id: 'output',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width * 0.5,
        y: NODE_SIZE.height,
      },
    ],
    icon: Layers,
  },
  'redpanda-rate-limit-node': {
    id: 'redpanda-rate-limit-node',
    title: 'Rate Limit Node',
    handles: [
      {
        id: 'input',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width * 0.5,
        y: 0,
      },
      {
        id: 'output',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width * 0.5,
        y: NODE_SIZE.height,
      },
    ],
    icon: Timer,
  },
  'redpanda-scanner-node': {
    id: 'redpanda-scanner-node',
    title: 'Scanner Node',
    handles: [
      {
        id: 'input',
        type: 'target',
        position: Position.Top,
        x: NODE_SIZE.width * 0.5,
        y: 0,
      },
      {
        id: 'output',
        type: 'source',
        position: Position.Bottom,
        x: NODE_SIZE.width * 0.5,
        y: NODE_SIZE.height,
      },
    ],
    icon: Search,
  },
};
