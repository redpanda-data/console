'use client';

import { useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { AppEdge } from '@/components/node-editor/edges';
import type { AppNode } from '@/components/node-editor/nodes/nodes-config';
import { useAppStore } from '@/components/node-editor/store';

/**
 * This is a demo workflow runner that runs a simplified version of a workflow.
 * You can customize how nodes are processed by overriding `processNode` or
 * even replacing the entire `collectNodesToProcess` function with your own logic.
 */
export function useWorkflowRunner() {
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const isRunning = useRef(false);
  const { getNodes, setNodes, getEdges } = useAppStore(
    useShallow((state) => ({
      getNodes: state.getNodes,
      setNodes: state.setNodes,
      getEdges: state.getEdges,
    })),
  );

  const stopWorkflow = useCallback(() => {
    isRunning.current = false;
    setLogMessages((prev) => [...prev, 'Workflow stopped.']);
  }, []);

  const resetNodeStatus = useCallback(() => {
    setNodes(
      getNodes().map((node) => ({
        ...node,
        data: { ...node.data, status: 'initial' },
      })),
    );
  }, [getNodes, setNodes]);

  const updateNodeStatus = useCallback(
    (nodeId: string, status: string) => {
      setNodes(
        getNodes().map((node) =>
          node.id === nodeId ? ({ ...node, data: { ...node.data, status } } as AppNode) : node,
        ),
      );
    },
    [setNodes, getNodes],
  );

  const processNode = useCallback(
    async (node: AppNode) => {
      updateNodeStatus(node.id, 'loading');
      setLogMessages((prev) => [...prev, `${node.data.title} processing...`]);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (!isRunning.current) {
        resetNodeStatus();
        return;
      }

      updateNodeStatus(node.id, 'success');
    },
    [updateNodeStatus, resetNodeStatus],
  );

  const runWorkflow = useCallback(
    async (startNodeId?: string) => {
      if (isRunning.current) return;
      const nodes = getNodes();
      const edges = getEdges();
      isRunning.current = true;

      // for this demo, we'll start with the passed start node
      // or the first node that doesn't have any incoming edges
      const _startNodeId = startNodeId || nodes.find((node) => !edges.some((e) => e.target === node.id))?.id;

      if (!_startNodeId) {
        return;
      }

      setLogMessages(['Starting workflow...']);

      const nodesToProcess = collectNodesToProcess(nodes, edges, _startNodeId);

      for (const node of nodesToProcess) {
        if (!isRunning.current) break;
        await processNode(node);
      }

      if (isRunning.current) {
        setLogMessages((prev) => [...prev, 'Workflow processing complete.']);
      }

      isRunning.current = false;
    },
    [getNodes, getEdges, processNode],
  );

  return {
    logMessages,
    runWorkflow,
    stopWorkflow,
    isRunning: isRunning.current,
  };
}

/**
 * This is a very simplified example of how you might traverse a graph and collect nodes to process.
 * It's not meant to be used in production, but you can use it as a starting point for your own logic.
 */
function collectNodesToProcess(nodes: AppNode[], edges: AppEdge[], startNodeId: string) {
  const nodesToProcess: AppNode[] = [];
  const visited = new Set();

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    nodesToProcess.push(node);

    const outgoingEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of outgoingEdges) {
      visit(edge.target);
    }
  }

  visit(startNodeId);

  return nodesToProcess;
}
