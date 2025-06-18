import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/components/node-editor/store';
import { layoutGraph } from '@/components/node-editor/store/layout';

export function useLayout(shouldFitView = false) {
  const { fitView } = useReactFlow();
  const { getNodes, getEdges, setNodes, setEdges } = useAppStore(
    useShallow((state) => ({
      getNodes: state.getNodes,
      getEdges: state.getEdges,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
    })),
  );

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
