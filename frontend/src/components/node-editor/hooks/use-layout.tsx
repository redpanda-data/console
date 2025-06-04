import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/components/node-editor/store';
import type { AppStore } from '@/components/node-editor/store/app-store';
import { layoutGraph } from '@/components/node-editor/store/layout';

const selector = (state: AppStore) => ({
  getNodes: state.getNodes,
  setNodes: state.setNodes,
  getEdges: state.getEdges,
  setEdges: state.setEdges,
});

export function useLayout(shouldFitView = false) {
  const { fitView } = useReactFlow();
  const { getNodes, getEdges, setNodes, setEdges } = useAppStore(useShallow(selector));

  return useCallback(async () => {
    const nodes = getNodes();
    const edges = getEdges();

    const layoutedNodes = await layoutGraph(nodes, edges);

    const updatedEdges = edges.map((edge) => ({
      ...edge,
      style: { ...edge.style, opacity: 1 },
    }));

    setNodes(layoutedNodes);
    setEdges(updatedEdges);

    if (shouldFitView) {
      fitView({ padding: 0.2 });
    }
  }, [fitView, getEdges, getNodes, setEdges, setNodes, shouldFitView]);
}
