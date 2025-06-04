import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { type CSSProperties, useCallback, useEffect } from 'react';

import { AppDropdownMenu } from '@/components/node-editor/app-dropdown-menu';
import type { AppEdge } from '@/components/node-editor/edges';
import { useDropdown } from '@/components/node-editor/hooks/use-dropdown';
import type { AppNodeType, NodeConfig } from '@/components/node-editor/nodes';
import { useAppStore } from '@/components/node-editor/store';
import type { AppStore } from '@/components/node-editor/store/app-store';
import { Button } from '@/components/redpanda-ui/button';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';

const selector = (id: string) => {
  return (state: AppStore) => ({
    addNodeInBetween: state.addNodeInBetween,
    connectionSites: state.connectionSites,
    isPotentialConnection: state.potentialConnection?.id === `edge-${id}`,
  });
};

const filterNodes = (node: NodeConfig) => {
  return node.id === 'transform-node' || node.id === 'join-node' || node.id === 'branch-node';
};

export function EdgeButton({
  x,
  y,
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  style,
}: Pick<EdgeProps<AppEdge>, 'source' | 'target' | 'sourceHandleId' | 'targetHandleId' | 'id'> & {
  x: number;
  y: number;
  style: CSSProperties;
}) {
  const { addNodeInBetween, connectionSites, isPotentialConnection } = useAppStore(useShallow(selector(id)));
  const { isOpen, toggleDropdown, ref } = useDropdown();

  const onAddNode = useCallback(
    (type: AppNodeType) => {
      addNodeInBetween({
        type,
        source,
        target,
        sourceHandleId: sourceHandleId ?? undefined,
        targetHandleId: targetHandleId ?? undefined,
        position: { x, y },
      });
    },
    [addNodeInBetween, source, sourceHandleId, targetHandleId, target, x, y],
  );

  const connectionId = `edge-${id}`;
  // We add the possible connection sites to the store
  useEffect(() => {
    connectionSites.set(connectionId, {
      position: { x, y },
      source: { node: source, handle: sourceHandleId },
      target: { node: target, handle: targetHandleId },
      id: connectionId,
    });
  }, [connectionSites, x, y, connectionId, source, sourceHandleId, target, targetHandleId]);

  // we only want to remove the connection site when the component is unmounted
  useEffect(() => {
    return () => {
      connectionSites.delete(connectionId);
    };
  }, [connectionSites, connectionId]);

  return (
    <EdgeLabelRenderer>
      <div
        className="nodrag nopan pointer-events-auto absolute"
        style={{
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          ...style,
        }}
      >
        <Button
          onClick={(e) => {
            e.stopPropagation();
            toggleDropdown();
          }}
          size="icon"
          variant="secondary"
          className={clsx('border h-6 w-6 rounded-xl hover:bg-card', {
            'border-red-500': isPotentialConnection,
          })}
        >
          +
        </Button>
      </div>
      {isOpen && (
        <div
          ref={ref}
          className="absolute z-50"
          style={{
            top: `${y}px`,
            left: `${x}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <AppDropdownMenu onAddNode={onAddNode} filterNodes={filterNodes} />
        </div>
      )}
    </EdgeLabelRenderer>
  );
}
