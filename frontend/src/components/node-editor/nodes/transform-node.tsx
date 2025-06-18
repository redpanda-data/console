import type { WorkflowNodeProps } from '@/components/node-editor/nodes';
import { nodesConfig } from '@/components/node-editor/nodes/nodes-config';
import WorkflowNode from '@/components/node-editor/nodes/workflow-node';
import { AppHandle } from '@/components/node-editor/nodes/workflow-node/app-handle';

export function TransformNode({ id, data, type }: WorkflowNodeProps) {
  return (
    <WorkflowNode id={id} data={data} type={type}>
      {nodesConfig['transform-node'].handles.map((handle) => (
        <AppHandle
          key={`${handle.type}-${handle.id}`}
          id={handle.id}
          type={handle.type}
          position={handle.position}
          x={handle.x}
          y={handle.y}
        />
      ))}
      {/* Implement custom node specific functionality here */}
    </WorkflowNode>
  );
}
