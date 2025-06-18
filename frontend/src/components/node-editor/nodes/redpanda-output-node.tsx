import { NODE_SIZE } from '@/components/node-editor/nodes/nodes-config';
import { AppHandle } from '@/components/node-editor/nodes/workflow-node/app-handle';
import { Position } from '@xyflow/react';
import { RedpandaNode, type RedpandaNodeProps } from './redpanda-node';

export interface RedpandaOutputNodeProps extends RedpandaNodeProps {}

export function RedpandaOutputNode({ ...props }: RedpandaOutputNodeProps) {
  return (
    <RedpandaNode {...props}>
      <AppHandle id="input" type="target" position={Position.Top} x={NODE_SIZE.width * 0.5} y={0} />
    </RedpandaNode>
  );
}
