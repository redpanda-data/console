import { useReactFlow } from '@xyflow/react';
import { useCallback, useMemo } from 'react';

import { createNodeByType } from '@/components/node-editor/nodes';
import type { AppNode } from '@/components/node-editor/nodes/nodes-config';
import { useAppStore } from '@/components/node-editor/store';
import type { AppStore } from '@/components/node-editor/store/app-store';
import { useShallow } from 'zustand/react/shallow';

const selector = (state: AppStore) => ({
  addNode: state.addNode,
  addNodeInBetween: state.addNodeInBetween,
  potentialConnection: state.potentialConnection,
});

export function useDragAndDrop() {
  const { screenToFlowPosition } = useReactFlow();
  const { addNode, addNodeInBetween, potentialConnection } = useAppStore(useShallow(selector));

  const onDrop: React.DragEventHandler = useCallback(
    (event) => {
      const nodeProps = JSON.parse(event.dataTransfer.getData('application/reactflow'));

      if (!nodeProps) return;

      if (potentialConnection) {
        addNodeInBetween({
          type: nodeProps.id,
          source: potentialConnection.source?.node,
          target: potentialConnection.target?.node,
          sourceHandleId: potentialConnection.source?.handle,
          targetHandleId: potentialConnection.target?.handle,
          position: potentialConnection.position,
        });
      } else {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const newNode: AppNode = createNodeByType({
          type: nodeProps.id,
          position,
        });
        addNode(newNode);
      }
    },
    [addNode, addNodeInBetween, screenToFlowPosition, potentialConnection],
  );

  const onDragOver: React.DragEventHandler = useCallback((event) => event.preventDefault(), []);

  return useMemo(() => ({ onDrop, onDragOver }), [onDrop, onDragOver]);
}
