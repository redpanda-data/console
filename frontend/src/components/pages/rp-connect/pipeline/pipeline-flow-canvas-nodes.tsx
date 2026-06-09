/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath, Handle, Position } from '@xyflow/react';
import type { ComponentName } from 'assets/connectors/component-logo-map';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { BookOpenIcon, Box, ChevronDown, ChevronRight, PencilIcon, PlusIcon, Trash2 } from 'lucide-react';

import { getConnectorDocsUrl } from './pipeline-flow-nodes';
import { ConnectorLogo } from '../onboarding/connector-logo';
import type { NodeMetaEntry } from '../utils/pipeline-flow-meta';
import { FLOW_CARD_WIDTH } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const invisibleHandle = '!w-1.5 !h-1.5 !border-0 !bg-transparent !min-w-0 !min-h-0';

const SECTION_LABEL: Record<string, string> = {
  input: 'Input',
  processor: 'Processor',
  output: 'Output',
  resource: 'Resource',
};

export type FlowCardData = {
  label: string;
  role: 'main' | 'sub' | 'resource';
  section?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  childCount?: number;
  labelText?: string;
  topics?: string[];
  meta?: NodeMetaEntry[];
  missingTopic?: boolean;
  missingSasl?: boolean;
  editTarget?: EditTarget;
  // Injected by the canvas (edit mode only).
  onToggle?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
};

const HANDLE_IDS = [
  { id: 'l', position: Position.Left, type: 'target' },
  { id: 't', position: Position.Top, type: 'target' },
  { id: 'r', position: Position.Right, type: 'source' },
  { id: 'b', position: Position.Bottom, type: 'source' },
] as const;

const NodeHandles = () => (
  <>
    {HANDLE_IDS.map((h) => (
      <Handle className={invisibleHandle} id={h.id} key={h.id} position={h.position} type={h.type} />
    ))}
  </>
);

const HoverActions = ({ data, docsUrl }: { data: FlowCardData; docsUrl?: string }) => {
  if (!(data.onEdit || data.onDelete || docsUrl)) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      {docsUrl ? (
        <Button
          aria-label={`${data.label} documentation`}
          as="a"
          className="nodrag nopan"
          href={docsUrl}
          rel="noopener noreferrer"
          size="icon-xs"
          target="_blank"
          variant="ghost"
        >
          <BookOpenIcon />
        </Button>
      ) : null}
      {data.onEdit ? (
        <Button
          aria-label="Edit configuration"
          className="nodrag nopan"
          onClick={data.onEdit}
          size="icon-xs"
          variant="ghost"
        >
          <PencilIcon />
        </Button>
      ) : null}
      {data.onDelete ? (
        <Button aria-label="Remove" className="nodrag nopan" onClick={data.onDelete} size="icon-xs" variant="ghost">
          <Trash2 />
        </Button>
      ) : null}
    </div>
  );
};

const MetaRows = ({ data }: { data: FlowCardData }) => {
  const hasContent = data.meta?.length || data.topics?.length || data.missingTopic || data.missingSasl;
  if (!hasContent) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 border-border/60 border-t px-3 py-2">
      {data.meta?.map((entry) => (
        <div className="flex items-baseline gap-1.5 text-xs" key={`${entry.label}-${entry.value}`}>
          <span className="shrink-0 text-muted-foreground">{entry.label}</span>
          <span className="min-w-0 truncate font-mono text-foreground" title={entry.value}>
            {entry.value}
          </span>
        </div>
      ))}
      {data.missingTopic || data.missingSasl ? (
        <div className="flex flex-wrap gap-1">
          {data.missingTopic ? (
            <MissingChip
              addLabel="Topic"
              missingLabel="No topic"
              onAdd={data.onAddTopic ? () => data.onAddTopic?.(data.section ?? '', data.label) : undefined}
            />
          ) : null}
          {data.missingSasl ? (
            <MissingChip
              addLabel="User"
              missingLabel="No user"
              onAdd={data.onAddSasl ? () => data.onAddSasl?.(data.section ?? '', data.label) : undefined}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const MissingChip = ({
  addLabel,
  missingLabel,
  onAdd,
}: {
  addLabel: string;
  missingLabel: string;
  onAdd?: () => void;
}) =>
  onAdd ? (
    <Button
      className="nodrag nopan"
      icon={<PlusIcon className="size-3" />}
      onClick={onAdd}
      size="xs"
      variant="secondary"
    >
      {addLabel}
    </Button>
  ) : (
    <Badge size="sm" variant="neutral-inverted">
      {missingLabel}
    </Badge>
  );

const PlaceholderCard = ({ data }: { data: FlowCardData }) => (
  <button
    className="nodrag nopan flex h-full w-full items-center justify-center gap-1.5 rounded-lg border border-border border-dashed bg-card/40 px-3 py-4 text-muted-foreground text-sm transition-colors hover:border-primary/60 hover:text-foreground"
    disabled={!data.onAddConnector}
    onClick={data.onAddConnector ? () => data.onAddConnector?.(data.section ?? '') : undefined}
    type="button"
  >
    <PlusIcon className="size-4" />
    Add {data.section ?? 'connector'}
  </button>
);

const ComponentCard = ({ data, docsUrl }: { data: FlowCardData; docsUrl?: string }) => {
  const kindLabel = SECTION_LABEL[data.section ?? ''] ?? '';
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-0.5">
        <Text as="span" className="text-muted-foreground uppercase tracking-wide" variant="captionStrongMedium">
          {kindLabel}
        </Text>
        <HoverActions data={data} docsUrl={docsUrl} />
      </div>
      <button
        className={cn(
          'nodrag nopan flex w-full items-center gap-2 px-3 pb-2 text-left',
          data.collapsible && 'cursor-pointer'
        )}
        disabled={!data.collapsible}
        onClick={data.collapsible ? data.onToggle : undefined}
        type="button"
      >
        <ConnectorLogo className="size-5 shrink-0" fallback={Box} name={data.label as ComponentName} />
        <Text as="span" className="min-w-0 flex-1 truncate font-semibold" title={data.label} variant="bodyStrongMedium">
          {data.label}
        </Text>
        {data.labelText ? (
          <Badge className="max-w-[40%] shrink-0" size="sm" variant="info-inverted">
            <span className="truncate">{data.labelText}</span>
          </Badge>
        ) : null}
        {data.collapsible ? (
          <span className="shrink-0 text-subtle">
            {data.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </span>
        ) : null}
        {data.collapsed && data.childCount ? <CountDot count={data.childCount} size="sm" variant="disabled" /> : null}
      </button>
      <MetaRows data={data} />
    </div>
  );
};

const FlowCardNode = ({ data }: { data: FlowCardData }) => {
  const isPlaceholder = data.label === 'none';
  const docsUrl = isPlaceholder ? undefined : getConnectorDocsUrl(data.section ?? '', data.label);

  return (
    <div className="group relative" style={{ width: FLOW_CARD_WIDTH }}>
      <NodeHandles />
      {isPlaceholder ? <PlaceholderCard data={data} /> : <ComponentCard data={data} docsUrl={docsUrl} />}
    </div>
  );
};

export function FlowSpineEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  const onInsert = (data as { onInsert?: () => void } | undefined)?.onInsert;
  return (
    <>
      <BaseEdge markerEnd={markerEnd} path={path} style={{ stroke: 'var(--color-primary)', strokeWidth: 2 }} />
      {onInsert ? (
        <EdgeLabelRenderer>
          <button
            aria-label="Insert a step"
            className="nodrag nopan pointer-events-auto absolute flex size-6 items-center justify-center rounded-full border border-primary bg-background text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
            onClick={onInsert}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            type="button"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export function FlowChainEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  return <BaseEdge markerEnd={markerEnd} path={path} style={{ stroke: 'var(--color-border)', strokeWidth: 1.5 }} />;
}

export const flowNodeTypes = {
  flowCard: FlowCardNode,
};

export const flowEdgeTypes = {
  flowSpine: FlowSpineEdge,
  flowChain: FlowChainEdge,
};
