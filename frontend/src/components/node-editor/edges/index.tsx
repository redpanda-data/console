import type { Edge } from '@xyflow/react';

export type AppEdge = Edge<{}, 'workflow'>;

export const createEdge = (
  source: string,
  target: string,
  sourceHandleId?: string | null,
  targetHandleId?: string | null,
): AppEdge => ({
  id: `${source}-${sourceHandleId}-${target}-${targetHandleId}`,
  source,
  target,
  sourceHandle: sourceHandleId,
  targetHandle: targetHandleId,
  type: 'workflow',
  animated: true,
});
