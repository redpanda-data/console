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

import type { EdgeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Badge, type BadgeVariant } from 'components/redpanda-ui/components/badge';
import { Skeleton, SkeletonGroup } from 'components/redpanda-ui/components/skeleton';
import { cn } from 'components/redpanda-ui/lib/utils';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from 'components/ui/base-node';
import { ArrowRightIcon } from 'lucide-react';

import type { TreeGroupNodeData, TreeLeafNodeData, TreeSectionNodeData } from '../utils/pipeline-flow-parser';

const SECTION_COLORS: Record<string, string> = {
  input: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800',
  processor: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
  output: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
};

const SECTION_BADGE_VARIANT: Record<string, BadgeVariant> = {
  input: 'secondary',
  processor: 'secondary',
  output: 'secondary',
};

// ---------------------------------------------------------------------------
// TreeSectionNode
// ---------------------------------------------------------------------------

export function TreeSectionNode({ data }: { data: TreeSectionNodeData }) {
  return (
    <div
      className={cn(
        'rounded-xl border-2 border-dashed p-0',
        SECTION_COLORS[data.section] ?? 'border-border bg-muted/30'
      )}
      style={{ width: '100%', height: '100%' }}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <Badge variant={SECTION_BADGE_VARIANT[data.section] ?? 'outline'}>{data.label}</Badge>
      </div>
      <Handle className="!bg-transparent !border-0 !w-0 !h-0" id="right" position={Position.Right} type="source" />
      <Handle className="!bg-transparent !border-0 !w-0 !h-0" id="left" position={Position.Left} type="target" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TreeGroupNode
// ---------------------------------------------------------------------------

export function TreeGroupNode({ data }: { data: TreeGroupNodeData }) {
  return (
    <BaseNode className="border-dashed bg-muted/40">
      <BaseNodeHeader className="border-0 py-1">
        <BaseNodeHeaderTitle className="text-muted-foreground">{data.name}</BaseNodeHeaderTitle>
        <Badge className="ml-auto" variant="outline">
          {data.childCount}
        </Badge>
      </BaseNodeHeader>
      <BaseNodeContent className="p-0">{null}</BaseNodeContent>
    </BaseNode>
  );
}

// ---------------------------------------------------------------------------
// TreeLeafNode
// ---------------------------------------------------------------------------

export function TreeLeafNode({ data }: { data: TreeLeafNodeData }) {
  return (
    <BaseNode>
      <BaseNodeContent className="flex items-center gap-2 py-2">
        <span className="truncate font-medium text-xs">{data.name}</span>
      </BaseNodeContent>
    </BaseNode>
  );
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export function SectionEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const midX = (sourceX + targetX) / 2;
  const path = `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;

  return (
    <g>
      <path className="stroke-border" d={path} fill="none" id={id} strokeDasharray="6 4" strokeWidth={1.5} />
      <foreignObject height={20} width={20} x={midX - 10} y={(sourceY + targetY) / 2 - 10}>
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
          <ArrowRightIcon className="h-3 w-3 text-muted-foreground" />
        </div>
      </foreignObject>
    </g>
  );
}

export function TreeEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  return <path className="stroke-border" d={path} fill="none" id={id} strokeWidth={1} />;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function PipelineFlowSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-8 p-6">
      {['Input', 'Pipeline', 'Output'].map((label) => (
        <div className="flex flex-col gap-2" key={label}>
          <Skeleton variant="text" width="sm" />
          <SkeletonGroup direction="vertical" spacing="sm">
            <Skeleton className="h-10 w-48" variant="rounded" />
            <Skeleton className="h-10 w-48" variant="rounded" />
          </SkeletonGroup>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node type registry
// ---------------------------------------------------------------------------

export const pipelineFlowNodeTypes = {
  treeSection: TreeSectionNode,
  treeGroup: TreeGroupNode,
  treeLeaf: TreeLeafNode,
} as const;

export const pipelineFlowEdgeTypes = {
  sectionEdge: SectionEdge,
  treeEdge: TreeEdge,
} as const;
