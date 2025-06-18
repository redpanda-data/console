import { NODE_SIZE } from '@/components/node-editor/nodes/nodes-config';
import { AppHandle } from '@/components/node-editor/nodes/workflow-node/app-handle';
import { Position } from '@xyflow/react';
import { RedpandaNode, type RedpandaNodeProps } from './redpanda-node';

export interface RedpandaCacheNodeProps extends RedpandaNodeProps {}

export function RedpandaCacheNode({ ...props }: RedpandaCacheNodeProps) {
  return (
    <RedpandaNode {...props}>
      <AppHandle id="input" type="target" position={Position.Top} x={NODE_SIZE.width * 0.5} y={0} />
      <AppHandle id="output" type="source" position={Position.Bottom} x={NODE_SIZE.width * 0.5} y={NODE_SIZE.height} />
    </RedpandaNode>
  );
}
