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

import { type Edge, type Node, PanOnScrollMode, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { Button } from 'components/redpanda-ui/components/button';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { PipelineFlowSkeleton, pipelineEdgeTypes, pipelineNodeTypes } from './pipeline-flow-nodes';
import {
  computeTreeLayout as defaultComputeLayout,
  parsePipelineFlowTree as defaultParseTree,
  type ParsePipelineFlowTreeResult,
  type PipelineFlowNode,
} from '../utils/pipeline-flow-parser';

const PAN_ON_SCROLL_MODE = PanOnScrollMode.Vertical;
const EXTENT_PADDING = 40;
const PARSE_DEBOUNCE_MS = 300;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

function ZoomControls() {
  const { zoomIn, zoomOut } = useReactFlow();
  return (
    <div className="absolute right-2 bottom-2 z-10 flex flex-col gap-1">
      <Button
        aria-label="Zoom in"
        className="nodrag nopan"
        onClick={() => zoomIn({ duration: 200 })}
        size="xs"
        variant="outline"
      >
        <PlusIcon className="size-3.5" />
      </Button>
      <Button
        aria-label="Zoom out"
        className="nodrag nopan"
        onClick={() => zoomOut({ duration: 200 })}
        size="xs"
        variant="outline"
      >
        <MinusIcon className="size-3.5" />
      </Button>
    </div>
  );
}

type PipelineFlowDiagramProps = {
  configYaml: string;
  /** Callback when user clicks + on a placeholder node. Receives the section type ('input' | 'output'). */
  onAddConnector?: (type: string) => void;
  /** Callback when user clicks "+ topic" on a redpanda node missing topic config. */
  onAddTopic?: (section: string, componentName: string) => void;
  /** Callback when user clicks "+ auth" on a redpanda node missing SASL config. */
  onAddSasl?: (section: string, componentName: string) => void;
  /** Hide the zoom +/- controls. */
  hideZoomControls?: boolean;
  /** Custom parser — defaults to `parsePipelineFlowTree`. */
  parseTree?: (yaml: string) => ParsePipelineFlowTreeResult;
  /** Custom layout — defaults to `computeTreeLayout`. */
  computeLayout?: (
    nodes: PipelineFlowNode[],
    collapsedIds: ReadonlySet<string>
  ) => { rfNodes: Node[]; rfEdges: Edge[]; height: number };
};

/**
 * Compute translate extent from layout node positions.
 *
 * The bottom-right bound is clamped to at least the container dimensions.
 * Without this, d3-zoom centers content that is shorter than the viewport,
 * which manifests as a large top margin in edit/create mode where the node
 * tree is typically shorter than the panel.
 */
function computeTranslateExtent(
  rfNodes: Node[],
  containerWidth: number,
  containerHeight: number
): [[number, number], [number, number]] {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (const node of rfNodes) {
    const { x, y } = node.position;
    const w = node.measured?.width ?? node.width ?? 300;
    const h = node.measured?.height ?? node.height ?? 36;

    if (x < minX) {
      minX = x;
    }
    if (y < minY) {
      minY = y;
    }
    if (x + w > maxX) {
      maxX = x + w;
    }
    if (y + h > maxY) {
      maxY = y + h;
    }
  }

  return [
    [minX - EXTENT_PADDING, minY - EXTENT_PADDING],
    [Math.max(maxX + EXTENT_PADDING, containerWidth), Math.max(maxY + EXTENT_PADDING, containerHeight)],
  ];
}

export const PipelineFlowDiagram = ({
  configYaml,
  onAddConnector,
  onAddTopic,
  onAddSasl,
  hideZoomControls,
  parseTree = defaultParseTree,
  computeLayout = defaultComputeLayout,
}: PipelineFlowDiagramProps) => {
  const instanceId = useId();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  const debouncedYaml = useDebouncedValue(configYaml, PARSE_DEBOUNCE_MS);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Measure container synchronously before first paint so ReactFlow
  // initialises with the correct translateExtent (avoids centering flash).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) {
      setContainerSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    }
  }, []);

  // Track subsequent resizes (e.g. ResizablePanel drag).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      setContainerSize((prev) => {
        if (prev && prev.width === w && prev.height === h) {
          return prev;
        }
        return { width: w, height: h };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, error } = useMemo(
    () =>
      parseTree === defaultParseTree
        ? defaultParseTree(debouncedYaml, { idPrefix: instanceId })
        : parseTree(debouncedYaml),
    [debouncedYaml, parseTree, instanceId]
  );

  const { rfNodes, rfEdges } = useMemo(() => {
    const layout = computeLayout(nodes, collapsedIds);

    // Inject callbacks into group, placeholder, and setup-hint leaf nodes.
    const nodesWithCallbacks = layout.rfNodes.map((node: Node) => {
      if (node.type === 'treeGroup') {
        return {
          ...node,
          data: { ...node.data, onToggle: () => toggleCollapse(node.id) },
        };
      }
      if (node.type === 'treeLeaf') {
        const isPlaceholder = node.data.label === 'none';
        // Placeholder nodes: show "+" connector button
        if (isPlaceholder && onAddConnector && (node.data.section === 'input' || node.data.section === 'output')) {
          return {
            ...node,
            data: { ...node.data, onAddConnector },
          };
        }
        // Non-placeholder redpanda nodes: inject setup hint callbacks
        if (!isPlaceholder && (node.data.missingTopic || node.data.missingSasl)) {
          return {
            ...node,
            data: {
              ...node.data,
              ...(onAddTopic && node.data.missingTopic ? { onAddTopic } : {}),
              ...(onAddSasl && node.data.missingSasl ? { onAddSasl } : {}),
            },
          };
        }
      }
      return node;
    });

    return { rfNodes: nodesWithCallbacks, rfEdges: layout.rfEdges };
  }, [nodes, collapsedIds, toggleCollapse, computeLayout, onAddConnector, onAddTopic, onAddSasl]);

  const translateExtent = useMemo(
    () => (containerSize ? computeTranslateExtent(rfNodes, containerSize.width, containerSize.height) : undefined),
    [rfNodes, containerSize]
  );

  if (rfNodes.length === 0) {
    return (
      <div className="relative h-full w-full" ref={containerRef}>
        <PipelineFlowSkeleton error={error} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full p-4" ref={containerRef}>
      {containerSize ? (
        <ReactFlowProvider>
          <ReactFlow
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            edges={rfEdges}
            edgeTypes={pipelineEdgeTypes}
            elementsSelectable={false}
            maxZoom={MAX_ZOOM}
            minZoom={MIN_ZOOM}
            nodes={rfNodes}
            nodesConnectable={false}
            nodesDraggable={false}
            nodesFocusable={false}
            nodeTypes={pipelineNodeTypes}
            panOnDrag={false}
            panOnScroll
            panOnScrollMode={PAN_ON_SCROLL_MODE}
            proOptions={{ hideAttribution: true }}
            translateExtent={translateExtent}
            zoomOnPinch={false}
            zoomOnScroll={false}
          />
          {hideZoomControls ? null : <ZoomControls />}
        </ReactFlowProvider>
      ) : null}
    </div>
  );
};
