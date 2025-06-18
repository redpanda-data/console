import { createNodeByType, createRedpandaNode } from '@/components/node-editor/nodes';
import type { AppNode } from '@/components/node-editor/nodes/nodes-config';
import type { SchemaNodeConfig } from '@/components/node-editor/redpanda-connect/schema-loader';
import { useAppStore } from '@/components/node-editor/store';
import { useReactFlow } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

export function useDragAndDrop() {
  const { screenToFlowPosition } = useReactFlow();
  const { addNode, addNodeInBetween, potentialConnection } = useAppStore(
    useShallow((state) => ({
      addNode: state.addNode,
      addNodeInBetween: state.addNodeInBetween,
      potentialConnection: state.potentialConnection,
    })),
  );

  const onDrop: React.DragEventHandler = useCallback(
    (event) => {
      // Try to get different node types
      const redpandaConfigData = event.dataTransfer.getData('application/redpanda-connect');
      const commonNodeData = event.dataTransfer.getData('application/common-node');

      let newNode: AppNode | null = null;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (redpandaConfigData) {
        // Handle Redpanda Connect component drop
        const schemaConfig: SchemaNodeConfig = JSON.parse(redpandaConfigData);
        newNode = createRedpandaNode({ schemaConfig, position });
      } else if (commonNodeData) {
        // Handle common node drop
        const commonNodeConfig = JSON.parse(commonNodeData);
        newNode = createNodeByType({
          type: commonNodeConfig.type,
          position,
        });
      }

      if (!newNode) return;

      if (potentialConnection && commonNodeData) {
        // Use potential connection for common nodes
        const nodeType = JSON.parse(commonNodeData).type;
        addNodeInBetween({
          type: nodeType,
          source: potentialConnection.source?.node,
          target: potentialConnection.target?.node,
          sourceHandleId: potentialConnection.source?.handle,
          targetHandleId: potentialConnection.target?.handle,
          position: potentialConnection.position,
        });
      } else {
        addNode(newNode);
      }
    },
    [addNode, addNodeInBetween, screenToFlowPosition, potentialConnection],
  );

  const onDragOver: React.DragEventHandler = useCallback((event) => event.preventDefault(), []);

  return useMemo(() => ({ onDrop, onDragOver }), [onDrop, onDragOver]);
}
