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

import { BaseEdge, type EdgeProps, Handle, Position } from '@xyflow/react';
import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
import { Banner, BannerClose, BannerContent } from 'components/redpanda-ui/components/banner';
import { Button } from 'components/redpanda-ui/components/button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { BaseNode } from 'components/ui/base-node';
import { ChevronDown, ChevronUp, PlusIcon } from 'lucide-react';

const invisibleHandle = '!w-0 !h-0 !border-0 !bg-transparent !min-w-0 !min-h-0';
const ARROW_GAP = 8;
const BRANCH_INDENT = 12;
const SECTION_EDGE_GAP = 20;

const SKELETON_SECTIONS = [
  { label: 'INPUT', leaves: 1 },
  { label: 'PROCESSORS', leaves: 2 },
  { label: 'OUTPUT', leaves: 1 },
] as const;

type PipelineFlowSkeletonProps = {
  error?: string;
};

export function PipelineFlowSkeleton({ error }: PipelineFlowSkeletonProps) {
  return (
    <div className="relative h-full w-full">
      {error ? (
        <Banner variant="accent">
          <BannerContent>Unable to visualize pipeline.</BannerContent>
          <BannerClose variant="ghost" />
        </Banner>
      ) : null}
      <div aria-hidden="true" className="pointer-events-none flex flex-col gap-4 p-4 pl-3">
        {SKELETON_SECTIONS.map((section) => (
          <div className="flex flex-col gap-2" key={section.label}>
            <Skeleton className={error ? 'animate-none! opacity-40' : ''} variant="text" width="xs" />
            {Array.from({ length: section.leaves }, (_, leafIndex) => (
              <Skeleton
                className={cn('ml-10', error ? 'animate-none! opacity-40' : '')}
                key={`${section.label}-leaf-${leafIndex}`}
                size="lg"
                variant="rounded"
                width="md"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

type TreeNodeData = {
  label: string;
  labelText?: string;
  topics?: string[];
  section?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  childCount?: number;
  onToggle?: () => void;
  onAddConnector?: (type: string) => void;
};

const TreeSectionNode = ({ data }: { data: TreeNodeData }) => (
  <div className="flex h-7 items-center">
    <Handle className={invisibleHandle} position={Position.Left} type="target" />
    <Text as="span" className="text-muted-foreground uppercase" variant="captionStrongMedium">
      {data.label}
    </Text>
    <Handle className={`${invisibleHandle} left-0!`} position={Position.Bottom} type="source" />
  </div>
);

const TreeGroupNode = ({ data }: { data: TreeNodeData }) => (
  <button className="nodrag nopan flex h-7 cursor-pointer items-center text-sm" onClick={data.onToggle} type="button">
    <Handle className={invisibleHandle} position={Position.Left} type="target" />
    <Text as="span" variant="bodyStrongMedium">
      {data.label}
    </Text>
    <Text as="span" className="ml-1 text-subtle" variant="bodySmall">
      {data.collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </Text>
    {data.collapsed && data.childCount ? (
      <CountDot className="ml-1.5" count={data.childCount} size="sm" variant="disabled" />
    ) : null}
    {!data.collapsed && <Handle className={`${invisibleHandle} left-0!`} position={Position.Bottom} type="source" />}
  </button>
);

const TreeLeafNode = ({ data }: { data: TreeNodeData }) => {
  const hasTopics = data.topics && data.topics.length > 0;
  const isPlaceholder = data.label === 'none';
  const showAddButton = isPlaceholder && data.onAddConnector && data.section;
  return (
    <BaseNode
      className={cn(
        'min-w-[120px] px-3 py-1 font-medium transition-colors',
        isPlaceholder
          ? 'border-dashed! text-muted-foreground'
          : 'border-transparent! bg-secondary/5 text-foreground hover:bg-secondary/10'
      )}
    >
      <Handle className={invisibleHandle} position={Position.Left} type="target" />
      <Text
        as="span"
        className={isPlaceholder ? 'text-muted-foreground' : 'text-foreground'}
        variant="bodyStrongMedium"
      >
        {isPlaceholder ? `Add ${data.section ?? 'connector'}` : data.label}
      </Text>
      <div className={cn(data.labelText || (hasTopics && 'mt-2'), 'flex gap-1.5')}>
        {data.labelText ? (
          <Badge size="sm" variant="primary-inverted">
            {data.labelText}
          </Badge>
        ) : null}
        {hasTopics ? (
          <BadgeGroup maxVisible={1} size="sm" variant="secondary-outline">
            {data.topics?.map((t) => (
              <Badge key={t} size="sm" variant="secondary-outline">
                topic: {t}
              </Badge>
            ))}
          </BadgeGroup>
        ) : null}
      </div>
      {showAddButton ? (
        <Button
          className="nodrag nopan absolute top-1/2 -right-3 -translate-y-1/2 rounded-full bg-background"
          onClick={() => data.onAddConnector?.(data.section ?? '')}
          size="icon-xs"
          variant="outline"
        >
          <PlusIcon />
        </Button>
      ) : null}
    </BaseNode>
  );
};

export function TreeEdge({ sourceX, sourceY, targetX, targetY, markerEnd }: EdgeProps) {
  const path = `M ${sourceX + BRANCH_INDENT} ${sourceY} V ${targetY} H ${targetX - ARROW_GAP}`;
  return <BaseEdge markerEnd={markerEnd} path={path} style={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />;
}

export function SectionEdge({ sourceX, sourceY, targetY, markerEnd }: EdgeProps) {
  const path = `M ${sourceX} ${sourceY} V ${targetY - SECTION_EDGE_GAP}`;
  return (
    <BaseEdge
      markerEnd={markerEnd}
      path={path}
      style={{
        stroke: 'var(--color-primary)',
        strokeWidth: 2,
      }}
    />
  );
}

export const pipelineNodeTypes = {
  treeSection: TreeSectionNode,
  treeGroup: TreeGroupNode,
  treeLeaf: TreeLeafNode,
};

export const pipelineEdgeTypes = {
  treeEdge: TreeEdge,
  sectionEdge: SectionEdge,
};
