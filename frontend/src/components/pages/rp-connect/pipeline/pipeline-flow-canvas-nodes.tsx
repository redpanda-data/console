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

import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  getStraightPath,
  Handle,
  Position,
} from '@xyflow/react';
import type { ComponentName } from 'assets/connectors/component-logo-map';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { BookOpenIcon, Box, ChevronDown, ChevronRight, PencilIcon, PlusIcon, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { getConnectorDocsUrl } from './pipeline-flow-nodes';
import { ConnectorLogo } from '../onboarding/connector-logo';
import type { NodeMetaEntry } from '../utils/pipeline-flow-meta';
import { FLOW_CARD_WIDTH } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const invisibleHandle = '!w-1.5 !h-1.5 !border-0 !bg-transparent !min-w-0 !min-h-0';
// Anchor the spine (left/right) handles a fixed distance below the card top —
// roughly the title row — so cards of differing heights still connect along a
// horizontal line. Bottom/top handles (branch threads) keep their defaults.
const SPINE_HANDLE_TOP = 36;

// React Flow drives panning/dragging from native listeners on ancestor elements:
// d3-zoom pans on `mousedown`/`touchstart`, d3-drag uses `pointerdown`. React's
// synthetic handlers run after those, so they can't cancel the gesture. We attach
// native listeners on the card and stop propagation only for presses that land on
// a real control — so the Edit/Add/collapse buttons click, while dragging the card
// body (or canvas) still pans.
const CONTROL_SELECTOR = 'button, a, input, select, textarea, [role="button"]';
const PRESS_EVENTS = ['mousedown', 'pointerdown', 'touchstart'] as const;

function useStopPanOnControls() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const handlePress = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest(CONTROL_SELECTOR)) {
        event.stopPropagation();
      }
    };
    for (const name of PRESS_EVENTS) {
      el.addEventListener(name, handlePress);
    }
    return () => {
      for (const name of PRESS_EVENTS) {
        el.removeEventListener(name, handlePress);
      }
    };
  }, []);
  return ref;
}

const SECTION_LABEL: Record<string, string> = {
  input: 'Input',
  processor: 'Processor',
  output: 'Output',
  resource: 'Resource',
};

export type FlowCardData = {
  label: string;
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
      <Handle
        className={invisibleHandle}
        id={h.id}
        key={h.id}
        position={h.position}
        style={h.id === 'l' || h.id === 'r' ? { top: SPINE_HANDLE_TOP } : undefined}
        type={h.type}
      />
    ))}
  </>
);

// Docs + remove reveal on hover; the Edit button stays visible so every editable
// node has an obvious entry point into its config dialog.
const CardActions = ({ data, docsUrl }: { data: FlowCardData; docsUrl?: string }) => {
  if (!(data.onEdit || data.onDelete || docsUrl)) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
        {data.onDelete ? (
          <Button aria-label="Remove" className="nodrag nopan" onClick={data.onDelete} size="icon-xs" variant="ghost">
            <Trash2 />
          </Button>
        ) : null}
      </div>
      {data.onEdit ? (
        <Button
          aria-label="Edit configuration"
          className="nodrag nopan"
          onClick={data.onEdit}
          size="icon-xs"
          variant="outline"
        >
          <PencilIcon />
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
    className="nodrag nopan flex h-full w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border border-dashed bg-card/40 px-3 py-4 text-muted-foreground text-sm transition-colors hover:border-primary/60 hover:bg-card/70 hover:text-foreground"
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
        <CardActions data={data} docsUrl={docsUrl} />
      </div>
      <button
        className={cn(
          'nodrag nopan flex w-full items-center gap-2 px-3 pb-2 text-left',
          data.collapsible && 'cursor-pointer rounded transition-colors hover:bg-muted/40'
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
  const ref = useStopPanOnControls();

  return (
    <div className="group relative" ref={ref} style={{ width: FLOW_CARD_WIDTH }}>
      <NodeHandles />
      {isPlaceholder ? <PlaceholderCard data={data} /> : <ComponentCard data={data} docsUrl={docsUrl} />}
    </div>
  );
};

// A container processor (branch/switch/parallel/…) or multi-input broker: a titled
// box that visually encloses its children. React Flow renders the child nodes
// inside the body; this component only draws the chrome (title bar + border).
const FlowContainerNode = ({ data }: { data: FlowCardData }) => {
  const ref = useStopPanOnControls();
  const kindLabel = SECTION_LABEL[data.section ?? ''] ?? '';
  const docsUrl = getConnectorDocsUrl(data.section ?? '', data.label);

  return (
    <div
      className="group relative flex h-full w-full flex-col rounded-lg border border-border border-dashed bg-muted/20 shadow-sm"
      ref={ref}
    >
      <NodeHandles />
      <div className="flex items-center justify-between gap-2 rounded-t-lg border-border/60 border-b bg-card/80 px-3 py-2">
        <button
          className={cn('nodrag nopan flex min-w-0 items-center gap-2 text-left', data.collapsible && 'cursor-pointer')}
          disabled={!data.collapsible}
          onClick={data.collapsible ? data.onToggle : undefined}
          type="button"
        >
          <ConnectorLogo className="size-5 shrink-0" fallback={Box} name={data.label as ComponentName} />
          <span className="flex min-w-0 flex-col">
            <Text as="span" className="text-[10px] text-muted-foreground uppercase leading-none tracking-wide">
              {kindLabel}
            </Text>
            <Text as="span" className="min-w-0 truncate font-semibold" title={data.label} variant="bodyStrongMedium">
              {data.label}
            </Text>
          </span>
          {data.collapsible ? (
            <span className="shrink-0 text-subtle">
              {data.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </span>
          ) : null}
          {data.collapsed && data.childCount ? <CountDot count={data.childCount} size="sm" variant="disabled" /> : null}
        </button>
        <CardActions data={data} docsUrl={docsUrl} />
      </div>
    </div>
  );
};

export function FlowSpineEdge({ sourceX, sourceY, targetX, targetY, markerEnd, data }: EdgeProps) {
  // The spine runs along a single row, so a straight line reads cleanest.
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const onInsert = (data as { onInsert?: () => void } | undefined)?.onInsert;
  return (
    <>
      <BaseEdge markerEnd={markerEnd} path={path} style={{ stroke: 'var(--color-primary)', strokeWidth: 2 }} />
      {onInsert ? (
        <EdgeLabelRenderer>
          <button
            aria-label="Insert a step"
            className="nodrag nopan pointer-events-auto absolute flex size-6 cursor-pointer items-center justify-center rounded-full border border-primary bg-background text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
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
  flowContainer: FlowContainerNode,
};

export const flowEdgeTypes = {
  flowSpine: FlowSpineEdge,
  flowChain: FlowChainEdge,
};
