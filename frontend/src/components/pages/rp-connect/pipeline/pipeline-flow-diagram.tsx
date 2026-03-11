/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PipelineFlowSkeleton, pipelineFlowEdgeTypes, pipelineFlowNodeTypes } from './pipeline-flow-nodes';
import { computeTreeLayout, parsePipelineFlowTree } from '../utils/pipeline-flow-parser';

type PipelineFlowDiagramProps = {
  yamlContent: string;
  className?: string;
};

const DEBOUNCE_MS = 300;

function PipelineFlowDiagramInner({ yamlContent, className }: PipelineFlowDiagramProps) {
  const { fitView } = useReactFlow();
  const [debouncedYaml, setDebouncedYaml] = useState(yamlContent);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce YAML changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedYaml(yamlContent);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [yamlContent]);

  const { nodes, edges } = useMemo(() => {
    const tree = parsePipelineFlowTree(debouncedYaml);
    return computeTreeLayout(tree);
  }, [debouncedYaml]);

  // Fit view when layout changes
  useEffect(() => {
    if (nodes.length > 0) {
      // Allow React Flow to render nodes before fitting
      requestAnimationFrame(() => {
        fitView({ padding: 0.2 });
      });
    }
  }, [nodes, fitView]);

  // Fit view on container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (nodes.length > 0) {
        fitView({ padding: 0.2 });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [nodes.length, fitView]);

  const handleInit = useCallback(() => {
    fitView({ padding: 0.2 });
  }, [fitView]);

  if (nodes.length === 0) {
    return <PipelineFlowSkeleton />;
  }

  return (
    <div className={className} ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        edges={edges}
        edgeTypes={pipelineFlowEdgeTypes}
        elementsSelectable={false}
        fitView
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodeTypes={pipelineFlowNodeTypes}
        onInit={handleInit}
        panOnDrag
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        zoomOnPinch
        zoomOnScroll={false}
      />
    </div>
  );
}

export function PipelineFlowDiagram(props: PipelineFlowDiagramProps) {
  return (
    <ReactFlowProvider>
      <PipelineFlowDiagramInner {...props} />
    </ReactFlowProvider>
  );
}
