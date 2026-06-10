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
import { FLOW_CARD_WIDTH, FLOW_COMPACT_CARD_WIDTH } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const invisibleHandle = '!w-1.5 !h-1.5 !border-0 !bg-transparent !min-w-0 !min-h-0';
// Anchor the spine (left/right) handles a fixed distance below the card top —
// roughly the title row — so cards of differing heights connect along a
// horizontal line. The top/bottom handles are anchored a fixed distance from the
// left so vertically-stacked cards of differing widths connect along a straight
// vertical line (no diagonal connectors).
const SPINE_HANDLE_TOP = 36;
const SPINE_HANDLE_LEFT = 18;

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

// A colored left accent gives each role a quick visual identity: sources, transforms,
// sinks, and shared resources read apart at a glance.
const SECTION_ACCENT: Record<string, string> = {
  input: 'var(--color-green-500)',
  processor: 'var(--color-blue-500)',
  output: 'var(--color-purple-500)',
  resource: 'var(--color-orange-500)',
};

// The routing condition that selects a branch, shown as a chip on the receiving
// card: `if <check>` for a condition, `default` for the catch-all, red for an
// error / dead-letter route.
const BranchConditionChip = ({ data }: { data: FlowCardData }) => {
  if (!(data.condition || data.isDefault)) {
    return null;
  }
  const text = data.condition ? `if ${data.condition}` : 'default';
  let tone: 'error' | 'muted' | 'condition' = 'condition';
  if (data.isErrorPath) {
    tone = 'error';
  } else if (data.isDefault) {
    tone = 'muted';
  }
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded border px-1.5 py-0.5 font-medium text-[10px] leading-none',
        tone === 'error' && 'border-destructive/40 bg-destructive/5 text-destructive',
        tone === 'muted' && 'border-border bg-muted/50 text-muted-foreground',
        tone === 'condition' && 'border-blue-500/40 bg-blue-500/5 text-blue-600'
      )}
      title={text}
    >
      <span className="truncate">{text}</span>
    </span>
  );
};

export type FlowCardData = {
  label: string;
  section?: string;
  /** Compact rendering for the sidebar (smaller, no kind badge or metadata). */
  compact?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  childCount?: number;
  labelText?: string;
  topics?: string[];
  meta?: NodeMetaEntry[];
  missingTopic?: boolean;
  missingSasl?: boolean;
  // Routing into this branch (switch/fallback). Shown as a chip on the card.
  condition?: string;
  isDefault?: boolean;
  isErrorPath?: boolean;
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
        style={h.id === 'l' || h.id === 'r' ? { top: SPINE_HANDLE_TOP } : { left: SPINE_HANDLE_LEFT }}
        type={h.type}
      />
    ))}
  </>
);

// Internal ports on a container so flow visibly threads through it: `gs` emits the
// entry / copy / fan-out edges from the header into the children; `gt` receives the
// merge-back / fan-in edges. Anchored at the header so the lines start/end there.
const HEADER_PORT_TOP = 22;
const ContainerHandles = () => (
  <>
    <NodeHandles />
    <Handle
      className={invisibleHandle}
      id="gs"
      position={Position.Right}
      style={{ left: 0, top: HEADER_PORT_TOP }}
      type="source"
    />
    <Handle
      className={invisibleHandle}
      id="gt"
      position={Position.Left}
      style={{ right: 0, left: 'auto', top: HEADER_PORT_TOP }}
      type="target"
    />
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

const PlaceholderCard = ({ data }: { data: FlowCardData }) => {
  const onClick = data.onAddConnector ? () => data.onAddConnector?.(data.section ?? '') : undefined;
  const label = `Add ${data.section ?? 'connector'}`;
  if (data.compact) {
    return (
      <button
        className="nodrag nopan flex h-full w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border border-dashed bg-card/40 px-2.5 py-1.5 text-muted-foreground text-sm transition-colors hover:border-primary/60 hover:bg-card/70 hover:text-foreground"
        disabled={!data.onAddConnector}
        onClick={onClick}
        type="button"
      >
        <PlusIcon className="size-4" />
        {label}
      </button>
    );
  }
  return (
    <button
      className="nodrag nopan group flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-border border-dashed bg-card px-3 py-4 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary hover:shadow-md"
      disabled={!data.onAddConnector}
      onClick={onClick}
      type="button"
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-current/40 bg-background/70 transition-colors group-hover:border-primary group-hover:bg-primary/10">
        <PlusIcon className="size-4" />
      </span>
      <Text as="span" className="font-medium text-sm" variant="bodyStrongMedium">
        {label}
      </Text>
    </button>
  );
};

// A small one-row pill used in the compact sidebar (logo + name, no badge/meta).
const CompactCard = ({ data, docsUrl }: { data: FlowCardData; docsUrl?: string }) => (
  <div className="group flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 shadow-sm transition-shadow hover:shadow-md">
    <ConnectorLogo className="size-4 shrink-0" fallback={Box} name={data.label as ComponentName} />
    <Text as="span" className="min-w-0 flex-1 truncate font-medium text-sm" title={data.label}>
      {data.label}
    </Text>
    <CardActions data={data} docsUrl={docsUrl} />
  </div>
);

const ComponentCard = ({ data, docsUrl }: { data: FlowCardData; docsUrl?: string }) => {
  const kindLabel = SECTION_LABEL[data.section ?? ''] ?? '';
  const accent = SECTION_ACCENT[data.section ?? ''];
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      style={accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : undefined}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Text
            as="span"
            className="shrink-0 uppercase tracking-wide"
            style={accent ? { color: accent } : undefined}
            variant="captionStrongMedium"
          >
            {kindLabel}
          </Text>
          <BranchConditionChip data={data} />
        </div>
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
  const width = data.compact ? FLOW_COMPACT_CARD_WIDTH : FLOW_CARD_WIDTH;

  const card = (() => {
    if (isPlaceholder) {
      return <PlaceholderCard data={data} />;
    }
    return data.compact ? (
      <CompactCard data={data} docsUrl={docsUrl} />
    ) : (
      <ComponentCard data={data} docsUrl={docsUrl} />
    );
  })();

  return (
    <div className="group relative" ref={ref} style={{ width }}>
      <NodeHandles />
      {card}
    </div>
  );
};

// The logo + (kind / name) of a container's title bar — compact shows one row, full
// stacks the colored kind label above the name.
const ContainerTitleText = ({ data, accent }: { data: FlowCardData; accent?: string }) => {
  if (data.compact) {
    return (
      <Text as="span" className="min-w-0 truncate font-medium text-sm" title={data.label}>
        {data.label}
      </Text>
    );
  }
  const kindLabel = SECTION_LABEL[data.section ?? ''] ?? '';
  return (
    <span className="flex min-w-0 flex-col">
      <Text
        as="span"
        className="text-[10px] uppercase leading-none tracking-wide"
        style={{ color: accent ?? 'var(--color-muted-foreground)' }}
      >
        {kindLabel}
      </Text>
      <Text as="span" className="min-w-0 truncate font-semibold" title={data.label} variant="bodyStrongMedium">
        {data.label}
      </Text>
    </span>
  );
};

// A container processor (branch/switch/parallel/…) or multi-input broker: a titled
// box that visually encloses its children. React Flow renders the child nodes
// inside the body; this component only draws the chrome (title bar + border).
const FlowContainerNode = ({ data }: { data: FlowCardData }) => {
  const ref = useStopPanOnControls();
  const accent = SECTION_ACCENT[data.section ?? ''];
  const docsUrl = getConnectorDocsUrl(data.section ?? '', data.label);

  return (
    <div
      className="group relative flex h-full w-full flex-col rounded-lg border border-border border-dashed bg-muted/20 shadow-sm"
      ref={ref}
      style={accent ? { borderLeftColor: accent, borderLeftWidth: 3, borderLeftStyle: 'solid' } : undefined}
    >
      <ContainerHandles />
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-t-lg border-border/60 border-b bg-card/80',
          data.compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
        )}
      >
        <button
          className={cn('nodrag nopan flex min-w-0 items-center gap-2 text-left', data.collapsible && 'cursor-pointer')}
          disabled={!data.collapsible}
          onClick={data.collapsible ? data.onToggle : undefined}
          type="button"
        >
          <ConnectorLogo
            className={cn('shrink-0', data.compact ? 'size-4' : 'size-5')}
            fallback={Box}
            name={data.label as ComponentName}
          />
          <ContainerTitleText accent={accent} data={data} />
          {data.collapsible ? (
            <span className="shrink-0 text-subtle">
              {data.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </span>
          ) : null}
          {data.collapsed && data.childCount ? <CountDot count={data.childCount} size="sm" variant="disabled" /> : null}
        </button>
        <div className="flex min-w-0 items-center gap-1.5">
          <BranchConditionChip data={data} />
          <CardActions data={data} docsUrl={docsUrl} />
        </div>
      </div>
    </div>
  );
};

// A non-interactive section divider ("INPUT" / "PROCESSORS" / …) in the compact lane.
const FlowSectionLabel = ({ data }: { data: { label?: string } }) => (
  <Text as="span" className="text-muted-foreground uppercase tracking-wide" variant="captionStrongMedium">
    {data.label}
  </Text>
);

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

type LinkTone = 'primary' | 'muted' | 'error';
type FlowLinkData = { label?: string; tone?: LinkTone; dashed?: boolean };

const LINK_STROKE: Record<LinkTone, string> = {
  primary: 'var(--color-primary)',
  muted: 'var(--color-border)',
  error: 'var(--color-destructive)',
};

// Every non-spine edge: container entry/chain, fan-out (with a routing-condition
// label), branch copy/merge (dashed), error/DLQ paths (red dashed), and resource
// references (muted dashed). Style is driven entirely by edge `data`.
export function FlowLinkEdge({
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
  const d = data as FlowLinkData | undefined;
  const tone = d?.tone ?? 'muted';
  return (
    <>
      <BaseEdge
        markerEnd={markerEnd}
        path={path}
        style={{
          stroke: LINK_STROKE[tone],
          strokeWidth: tone === 'muted' ? 1.5 : 2,
          strokeDasharray: d?.dashed ? '5 4' : undefined,
        }}
      />
      {d?.label ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'nodrag nopan absolute max-w-[170px] truncate rounded border bg-background px-1.5 py-0.5 font-medium text-[10px] shadow-sm',
              tone === 'error' ? 'border-destructive/40 text-destructive' : 'border-border text-muted-foreground'
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={d.label}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const flowNodeTypes = {
  flowCard: FlowCardNode,
  flowContainer: FlowContainerNode,
  flowSectionLabel: FlowSectionLabel,
};

export const flowEdgeTypes = {
  flowSpine: FlowSpineEdge,
  flowLink: FlowLinkEdge,
};
