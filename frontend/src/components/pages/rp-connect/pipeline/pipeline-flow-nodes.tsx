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
import { BookOpenIcon, ChevronDown, ChevronUp, PlusIcon } from 'lucide-react';

const invisibleHandle = '!w-0 !h-0 !border-0 !bg-transparent !min-w-0 !min-h-0';

const DOCS_BASE = 'https://docs.redpanda.com/redpanda-cloud/develop/connect/components';
const DOCS_SECTIONS = new Set(['input', 'output', 'processor']);

export function getConnectorDocsUrl(section: string, connectorName: string): string | undefined {
  if (!DOCS_SECTIONS.has(section)) {
    return;
  }
  return `${DOCS_BASE}/${section}s/${connectorName}/`;
}
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
        <Banner height="2rem" variant="accent">
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
  missingTopic?: boolean;
  missingSasl?: boolean;
  onToggle?: () => void;
  onAddConnector?: (type: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
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
  <button
    className={cn('nodrag nopan flex h-7 max-w-[220px] items-center text-sm', data.collapsible && 'cursor-pointer')}
    disabled={!data.collapsible}
    onClick={data.collapsible ? data.onToggle : undefined}
    type="button"
  >
    <Handle className={invisibleHandle} position={Position.Left} type="target" />
    <Text as="span" className="min-w-0 truncate" title={data.label} variant="bodyStrongMedium">
      {data.label}
    </Text>
    {data.collapsible ? (
      <Text as="span" className="ml-1 text-subtle" variant="bodySmall">
        {data.collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </Text>
    ) : null}
    {data.collapsed && data.childCount ? (
      <CountDot className="ml-1.5" count={data.childCount} size="sm" variant="disabled" />
    ) : null}
    {!data.collapsed && <Handle className={`${invisibleHandle} left-0!`} position={Position.Bottom} type="source" />}
  </button>
);

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: leaf node renders topics, setup hints, doc links, and placeholder add button
const TreeLeafNode = ({ data }: { data: TreeNodeData }) => {
  const hasTopics = data.topics && data.topics.length > 0;
  const isPlaceholder = data.label === 'none';
  const showAddButton = isPlaceholder && data.onAddConnector && data.section;
  const showSetupHints = !isPlaceholder && (data.missingTopic || data.missingSasl);
  const docsUrl = isPlaceholder ? undefined : getConnectorDocsUrl(data.section ?? '', data.label);
  return (
    <BaseNode
      className={cn(
        'group min-w-[120px] max-w-[220px] px-3 py-1 font-medium transition-colors',
        isPlaceholder ? 'border-dashed! text-muted-foreground' : 'border-transparent! bg-secondary/5 text-foreground'
      )}
    >
      <Handle className={invisibleHandle} position={Position.Left} type="target" />
      <div className="flex items-center gap-1.5">
        <Text
          as="span"
          className={cn('min-w-0 truncate', isPlaceholder ? 'text-muted-foreground' : 'text-foreground')}
          title={isPlaceholder ? undefined : data.label}
          variant="bodyStrongMedium"
        >
          {isPlaceholder ? `Add ${data.section ?? 'connector'}` : data.label}
        </Text>
        {docsUrl ? (
          <Button
            aria-label={`${data.label} documentation`}
            as="a"
            className="nodrag nopan shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            href={docsUrl}
            rel="noopener noreferrer"
            size="icon-xs"
            target="_blank"
            variant="ghost"
          >
            <BookOpenIcon />
          </Button>
        ) : null}
      </div>
      <div className={cn((data.labelText || hasTopics || showSetupHints) && 'mt-2', 'flex flex-wrap gap-1.5')}>
        {data.labelText ? (
          <Badge className="max-w-1/2" size="sm" variant="info-inverted">
            <span className="truncate" title={data.labelText}>
              {data.labelText}
            </span>
          </Badge>
        ) : null}
        {hasTopics ? (
          <BadgeGroup maxVisible={1} size="sm" variant="info-outline">
            {data.topics?.map((t) => (
              <Badge className="max-w-1/2" key={t} size="sm" variant="info-outline">
                <span className="truncate" title={t}>
                  topic: {t}
                </span>
              </Badge>
            ))}
          </BadgeGroup>
        ) : null}
        {showSetupHints ? (
          <>
            {data.missingTopic ? (
              <Button
                className="nodrag nopan"
                icon={<PlusIcon className="size-3" />}
                onClick={() => data.onAddTopic?.(data.section ?? '', data.label)}
                size="xs"
                variant="secondary"
              >
                Topic
              </Button>
            ) : null}
            {data.missingSasl ? (
              <Button
                className="nodrag nopan"
                icon={<PlusIcon className="size-3" />}
                onClick={() => data.onAddSasl?.(data.section ?? '', data.label)}
                size="xs"
                variant="secondary"
              >
                User
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {showAddButton ? (
        <Button
          className="nodrag nopan absolute top-1/2 -right-3 -translate-y-1/2 rounded-full"
          onClick={() => data.onAddConnector?.(data.section ?? '')}
          size="icon-xs"
          variant="secondary"
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
