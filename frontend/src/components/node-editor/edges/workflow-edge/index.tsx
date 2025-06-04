import { BaseEdge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';

import type { AppEdge } from '@/components/node-editor/edges';
import { EdgeButton } from '@/components/node-editor/edges/workflow-edge/edge-button';

export function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  sourceHandleId,
  target,
  style = {},
  markerEnd,
}: EdgeProps<AppEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ ...style, pointerEvents: 'auto' }} />
      <EdgeButton
        id={id}
        x={labelX}
        y={labelY}
        source={source}
        target={target}
        sourceHandleId={sourceHandleId}
        style={{ ...style }}
      />
    </>
  );
}
