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

import {
  type Edge,
  type Node,
  PanOnScrollMode,
  ReactFlow,
  type ReactFlowInstance,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { Button } from 'components/redpanda-ui/components/button';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import { ArrowRight, MinusIcon, PlusIcon, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { PipelineFlowSkeleton, pipelineEdgeTypes, pipelineNodeTypes } from './pipeline-flow-nodes';
import {
  computeTreeLayout as defaultComputeLayout,
  parsePipelineFlowTree as defaultParseTree,
  type ParsePipelineFlowTreeResult,
  type PipelineFlowNode,
} from '../utils/pipeline-flow-parser';

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
  onAddConnector?: (type: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  onBrowseTemplates?: () => void;
  hideZoomControls?: boolean;
  parseTree?: (yaml: string) => ParsePipelineFlowTreeResult;
  computeLayout?: (
    nodes: PipelineFlowNode[],
    collapsedIds: ReadonlySet<string>
  ) => { rfNodes: Node[]; rfEdges: Edge[]; height: number; maxDepth?: number };
};

export function computeTranslateExtent(
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

  // Lock each axis where content fits — the EXTENT_PADDING buffer would
  // otherwise let the viewport pan by ~40px with nothing to scroll to.
  const xFits = maxX <= containerWidth;
  const yFits = maxY <= containerHeight;
  const lowX = xFits ? 0 : minX - EXTENT_PADDING;
  const lowY = yFits ? 0 : minY - EXTENT_PADDING;
  const highX = xFits ? containerWidth : maxX + EXTENT_PADDING;
  const highY = yFits ? containerHeight : maxY + EXTENT_PADDING;
  return [
    [lowX, lowY],
    [highX, highY],
  ];
}

export const PipelineFlowDiagram = ({
  configYaml,
  onAddConnector,
  onAddTopic,
  onAddSasl,
  onBrowseTemplates,
  hideZoomControls,
  parseTree = defaultParseTree,
  computeLayout = defaultComputeLayout,
}: PipelineFlowDiagramProps) => {
  const instanceId = useId();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const rfInstanceRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
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
    if (!el) {
      return;
    }
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) {
      setContainerSize({ width: w, height: h });
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
      if (w === 0 || h === 0) {
        return;
      }
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

  const { translateExtent, contentOverflows } = useMemo(() => {
    if (!containerSize) {
      return { translateExtent: undefined, contentOverflows: false };
    }
    const extent = computeTranslateExtent(rfNodes, containerSize.width, containerSize.height);
    const rawMaxX = extent[1][0] - EXTENT_PADDING;
    const rawMaxY = extent[1][1] - EXTENT_PADDING;
    const overflows = rawMaxX > containerSize.width || rawMaxY > containerSize.height;
    return {
      translateExtent: extent,
      contentOverflows: overflows,
    };
  }, [rfNodes, containerSize]);

  // React Flow occasionally settles with a vertical offset when the container
  // is much taller than the diagram; defaultViewport alone doesn't override it.
  useLayoutEffect(() => {
    const rf = rfInstanceRef.current;
    if (rf && rfNodes.length > 0) {
      rf.setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [rfNodes, translateExtent]);

  // At the diagram's top/bottom pan boundary, swallow the wheel event in capture
  // so the page scrolls instead. Mid-range events fall through to React Flow's pan.
  useEffect(() => {
    const el = containerRef.current;
    if (!(el && contentOverflows && translateExtent && containerSize)) {
      return;
    }
    const [[, minBoundY], [, maxBoundY]] = translateExtent;
    const maxVpY = -minBoundY;
    const minVpY = containerSize.height - maxBoundY;
    const handleWheel = (event: WheelEvent) => {
      const rf = rfInstanceRef.current;
      if (!rf) {
        return;
      }
      const vp = rf.getViewport();
      const atTop = vp.y >= maxVpY - 0.5;
      const atBottom = vp.y <= minVpY + 0.5;
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
        event.stopPropagation();
      }
    };
    el.addEventListener('wheel', handleWheel, { capture: true, passive: true });
    return () => el.removeEventListener('wheel', handleWheel, { capture: true } as EventListenerOptions);
  }, [contentOverflows, translateExtent, containerSize]);

  if (rfNodes.length === 0) {
    return (
      <div className="relative h-full w-full" ref={containerRef}>
        <PipelineFlowSkeleton error={error} />
      </div>
    );
  }

  // Section labels and `none` placeholders don't count as user content.
  const isPipelineEmpty = !nodes.some((n) => n.kind === 'group' || (n.kind === 'leaf' && n.label !== 'none'));
  const showTemplateFab = Boolean(onBrowseTemplates) && isPipelineEmpty;

  return (
    <div
      className="relative h-full w-full overflow-hidden [&_*::-webkit-scrollbar]:hidden [&_*]:[scrollbar-width:none]"
      ref={containerRef}
    >
      {containerSize ? (
        <ReactFlowProvider>
          <ReactFlow
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            edges={rfEdges}
            edgeTypes={pipelineEdgeTypes}
            elementsSelectable={false}
            maxZoom={hideZoomControls ? 1 : MAX_ZOOM}
            minZoom={hideZoomControls ? 1 : MIN_ZOOM}
            nodes={rfNodes}
            nodesConnectable={false}
            nodesDraggable={false}
            nodesFocusable={false}
            nodeTypes={pipelineNodeTypes}
            onInit={(instance) => {
              rfInstanceRef.current = instance;
              instance.setViewport({ x: 0, y: 0, zoom: 1 });
            }}
            panOnDrag={false}
            panOnScroll={contentOverflows}
            panOnScrollMode={PanOnScrollMode.Vertical}
            preventScrolling={contentOverflows}
            proOptions={{ hideAttribution: true }}
            translateExtent={translateExtent}
            zoomOnPinch={false}
            zoomOnScroll={false}
          />
          {hideZoomControls ? null : <ZoomControls />}
          <AnimatePresence>
            {showTemplateFab && onBrowseTemplates ? (
              <motion.div
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="pointer-events-none absolute right-4 bottom-4 left-4 z-10"
                exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } }}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ duration: 0.3, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <button
                  aria-label="Start from a template"
                  className="nodrag nopan group pointer-events-auto flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-primary/30 border-dashed bg-primary/5 px-3 py-2.5 text-left transition-all hover:border-primary/60 hover:bg-primary/10 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                  data-testid="pipeline-diagram-browse-templates"
                  onClick={onBrowseTemplates}
                  type="button"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="font-medium text-foreground text-sm">Start from a template</span>
                    <span className="text-muted-foreground text-xs">Skip the YAML — fill a short form</span>
                  </div>
                  <ArrowRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </ReactFlowProvider>
      ) : null}
    </div>
  );
};
