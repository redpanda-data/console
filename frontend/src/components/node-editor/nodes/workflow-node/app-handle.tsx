'use client';

import {
  type Position,
  type XYPosition,
  useConnection,
  useInternalNode,
  useNodeConnections,
  useNodeId,
} from '@xyflow/react';
import clsx from 'clsx';
import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AppDropdownMenu } from '@/components/node-editor/app-dropdown-menu';
import { ButtonHandle } from '@/components/node-editor/button-handle';
import { useDropdown } from '@/components/node-editor/hooks/use-dropdown';
import type { NodeConfig } from '@/components/node-editor/nodes';
import type { AppNodeType } from '@/components/node-editor/nodes/nodes-config';
import { useAppStore } from '@/components/node-editor/store';
import { Button } from '@/components/redpanda-ui/button';

export const compatibleNodeTypes = (type: 'source' | 'target') => {
  if (type === 'source') {
    // Source handles (outputs) can connect to nodes that have inputs
    // Exclude input-only nodes since input nodes cannot connect to other input nodes
    return (node: NodeConfig) => {
      return node.id === 'transform-node' || node.id === 'join-node' || node.id === 'branch-node';
    };
  }
  // Target handles (inputs) can connect to nodes that have outputs
  // Exclude output-only nodes since output nodes cannot connect to other output nodes
  return (node: NodeConfig) => {
    return (
      node.id === 'transform-node' || node.id === 'join-node' || node.id === 'branch-node'
      // Explicitly exclude 'redpanda-output-node' - output nodes cannot connect to other output nodes
    );
  };
};

// TODO: we need to streamline how we calculate the yOffset
const yOffset = (type: 'source' | 'target') => (type === 'source' ? 50 : -65);

function getIndicatorPostion(nodePosition: XYPosition, x: number, y: number, type: 'source' | 'target') {
  return {
    x: nodePosition.x + x,
    y: nodePosition.y + y + yOffset(type),
  };
}

const fallbackPosition = { x: 0, y: 0 };

export function AppHandle({
  className,
  position: handlePosition,
  type,
  id,
  x,
  y,
}: {
  className?: string;
  id?: string | null;
  type: 'source' | 'target';
  position: Position;
  x: number;
  y: number;
}) {
  const nodeId = useNodeId() ?? '';

  const connections = useNodeConnections({
    handleType: type,
    handleId: id ?? undefined,
  });

  const isConnectionInProgress = useConnection((c) => c.inProgress);

  const { isOpen, toggleDropdown } = useDropdown();
  const { draggedNodes, addNodeInBetween, connectionSites, isPotentialConnection } = useAppStore(
    useShallow((state) => ({
      draggedNodes: state.draggedNodes,
      addNodeInBetween: state.addNodeInBetween,
      connectionSites: state.connectionSites,
      isPotentialConnection: state.potentialConnection?.id === `handle-${nodeId}-${type}-${id}`,
    })),
  );

  // We get the actual position of the node
  const nodePosition = useInternalNode(nodeId)?.internals.positionAbsolute ?? fallbackPosition;

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling to parent node
    toggleDropdown();
  };

  const onAddNode = useCallback(
    (nodeType: AppNodeType) => {
      if (!nodeId) {
        return;
      }

      addNodeInBetween({
        type: nodeType,
        [type]: nodeId,
        [`${type}HandleId`]: id,
        position: getIndicatorPostion(nodePosition, x, y, type),
      });

      toggleDropdown();
    },
    [nodeId, id, type, nodePosition, x, y, toggleDropdown, addNodeInBetween],
  );

  const displayAddButton = connections.length === 0 && !isConnectionInProgress && !draggedNodes.has(nodeId);

  const connectionId = `handle-${nodeId}-${type}-${id}`;
  useEffect(() => {
    if (displayAddButton) {
      connectionSites.set(connectionId, {
        position: getIndicatorPostion(nodePosition, x, y, type),
        [type]: {
          node: nodeId,
          handle: id,
        },
        type,
        id: connectionId,
      });
    }
    return () => {
      connectionSites.delete(connectionId);
    };
  }, [nodePosition, connectionSites, connectionId, id, nodeId, type, x, y, displayAddButton]);

  return (
    <ButtonHandle
      type={type}
      position={handlePosition}
      id={id}
      className={clsx('left-[-6px] top-[-6px]', className)}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      showButton={displayAddButton}
    >
      <Button
        onClick={onClick}
        size="icon"
        variant="secondary"
        className={clsx('border h-6 w-6 rounded-xl hover:bg-card', {
          'border-red-500': isPotentialConnection,
        })}
      >
        +
      </Button>
      {isOpen && (
        <div className="absolute z-50 mt-2 left-1/2 transform -translate-x-1/2">
          <AppDropdownMenu onAddNode={onAddNode} filterNodes={compatibleNodeTypes(type)} />
        </div>
      )}
    </ButtonHandle>
  );
}
