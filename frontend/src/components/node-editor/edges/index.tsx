import type { Edge } from '@xyflow/react';

export type AppEdge = Edge<{}, 'workflow'>;

export const createEdge = (
  source: string,
  target: string,
  sourceHandleId?: string | null,
  targetHandleid?: string | null,
): AppEdge => ({
  id: `${source}-${sourceHandleId}-${target}-${targetHandleid}`,
  source,
  target,
  sourceHandle: sourceHandleId,
  targetHandle: targetHandleid,
  type: 'workflow',
  animated: true,
});
