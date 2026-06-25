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
import {
  AlertCircle,
  Box,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitFork,
  GitMerge,
  Layers,
  type LucideIcon,
  Network,
  PlusIcon,
  Repeat,
  RotateCw,
  Rows3,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Split,
  Workflow,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { ConnectorLogo } from '../onboarding/connector-logo';
import type { NodeMetaEntry } from '../utils/pipeline-flow-meta';
import {
  FLOW_CARD_WIDTH,
  FLOW_COMPACT_CARD_WIDTH,
  FLOW_SPINE_HANDLE_LEFT,
  type FlowInsertPayload,
} from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const invisibleHandle = '!w-1.5 !h-1.5 !border-0 !bg-transparent !min-w-0 !min-h-0';
// A node revealed this render fades + grows in. Applied to the card body, never the RF node
// wrapper (whose `transform` drives positioning and would fight a scale/translate animation).
const APPEAR_ANIM = 'fade-in zoom-in-95 animate-in duration-200';
// Top/bottom handles anchored a fixed distance from the left so vertically-stacked cards of
// differing widths connect along a straight vertical line.
const SPINE_HANDLE_LEFT = FLOW_SPINE_HANDLE_LEFT;

// RF drives pan/drag from native listeners on ancestors (d3-zoom on mousedown/touchstart, d3-drag
// on pointerdown); React's synthetic handlers run after, so they can't cancel the gesture. We
// attach native listeners on the card and stop propagation only for presses on a real control —
// so buttons click while dragging the card body (or canvas) still pans.
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

// Each role's colour identity: sources, transforms, sinks, and shared resources read apart at a glance.
export const SECTION_ACCENT: Record<string, string> = {
  input: 'var(--color-green-500)',
  processor: 'var(--color-blue-500)',
  output: 'var(--color-purple-500)',
  resource: 'var(--color-orange-500)',
};

export function sectionAccent(section?: string): string | undefined {
  return section ? SECTION_ACCENT[section] : undefined;
}

// Role colour as a tinted title band (not a border): a faint wash behind the kind label / logo /
// name, body left clean, so it doesn't compete with the selection / error rings. Opaque (mixed
// over the card colour) so it layers correctly on leaf cards and container headers alike.
function headerTintStyle(accent?: string): React.CSSProperties | undefined {
  return accent ? { backgroundColor: `color-mix(in srgb, ${accent} 10%, var(--color-card))` } : undefined;
}

// Depth-alternating container surface: even levels greyer, odd levels lighter, so a nested
// container is never the same shade as its parent. Opaque (a color-mix, not an alpha wash) so
// stacking never compounds to mud.
function containerSurface(depth: number): string {
  const pct = depth % 2 === 0 ? 13 : 5;
  return `color-mix(in srgb, var(--color-muted-foreground) ${pct}%, var(--color-background))`;
}

// The connector logo in a small elevated tile so it sits cleanly on the tinted header band.
const LogoTile = ({ name, compact }: { name: string; compact?: boolean }) => (
  <span
    className={cn(
      'flex shrink-0 items-center justify-center rounded-md border border-border/60 bg-background',
      compact ? 'size-6' : 'size-7'
    )}
  >
    <ConnectorLogo className={compact ? 'size-4' : 'size-5'} fallback={Box} name={name as ComponentName} />
  </span>
);

// A node's routing semantics as a chip: `if <check>`, `default` (catch-all), or `on error`
// (catch) — red for error / dead-letter routes. The single home for a switch case's condition
// (no duplicate floating edge label); with `onEdit` the chip opens the case editor.
const BranchConditionChip = ({
  data,
  className,
  onEdit,
  selected,
}: {
  data: FlowCardData;
  className?: string;
  onEdit?: () => void;
  selected?: boolean;
}) => {
  if (!(data.condition || data.isDefault || data.isErrorPath)) {
    return null;
  }
  let text = 'on error';
  if (data.condition) {
    text = `if ${data.condition}`;
  } else if (data.isDefault) {
    text = 'default';
  }
  let tone: 'error' | 'muted' | 'condition' = 'condition';
  if (data.isErrorPath) {
    tone = 'error';
  } else if (data.isDefault) {
    tone = 'muted';
  }
  const cls = cn(
    'inline-flex min-w-0 max-w-full items-center rounded border px-1.5 py-0.5 font-medium text-[10px] leading-none',
    tone === 'error' && 'border-destructive/40 bg-destructive/5 text-destructive',
    tone === 'muted' && 'border-condition/30 bg-condition/5 text-condition/80',
    tone === 'condition' && 'border-condition/40 bg-condition/10 text-condition',
    onEdit && 'nodrag nopan cursor-pointer transition-colors hover:bg-foreground/5',
    selected && 'ring-2 ring-primary ring-inset',
    className
  );
  if (onEdit) {
    return (
      <button
        className={cls}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        title={`${text} — click to edit condition`}
        type="button"
      >
        <span className="truncate">{text}</span>
      </button>
    );
  }
  return (
    <span className={cls} title={text}>
      <span className="truncate">{text}</span>
    </span>
  );
};

// Routing conditions get their own colour family — AMBER (the flowchart/BPMN decision convention)
// — distinct from the section accents so routing logic is easy to scan. Error/dead-letter routes
// keep red (that semantic wins); a `default` catch-all is a muted amber.
const CONDITION_ROW_TONE: Record<'condition' | 'muted' | 'error', string> = {
  condition: 'border-condition/30 bg-condition/10 text-condition',
  muted: 'border-condition/20 bg-condition/5 text-condition/80',
  error: 'border-destructive/20 bg-destructive/10 text-destructive',
};

// A switch case's routing condition on its own full-width row (more contrast than the inline
// header chip): a `WHEN <check>` / `DEFAULT` / `ON ERROR` line. The click target for editing the
// case (distinct from selecting the component card); inset ring when the condition is selected.
const ConditionRow = ({
  data,
  onEdit,
  selected,
}: {
  data: FlowCardData;
  onEdit?: () => void;
  selected?: boolean;
}) => {
  let tone: 'condition' | 'muted' | 'error' = 'condition';
  if (data.isErrorPath) {
    tone = 'error';
  } else if (data.isDefault && !data.condition) {
    tone = 'muted';
  }
  let eyebrow = 'on error';
  if (data.condition) {
    eyebrow = 'when';
  } else if (data.isDefault) {
    eyebrow = 'default';
  }
  const cls = cn(
    'flex w-full items-center gap-1.5 border-b px-3 py-1.5 text-left',
    CONDITION_ROW_TONE[tone],
    onEdit && 'nodrag nopan cursor-pointer transition-[filter] hover:brightness-95',
    selected && 'ring-2 ring-primary ring-inset'
  );
  const body = (
    <>
      <Split className="size-3.5 shrink-0 opacity-80" />
      <span className="shrink-0 font-semibold text-[10px] uppercase tracking-wide opacity-70">{eyebrow}</span>
      {data.condition ? (
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={data.condition}>
          {data.condition}
        </span>
      ) : null}
    </>
  );
  if (onEdit) {
    return (
      <button
        className={cls}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        title={`${eyebrow}${data.condition ? ` ${data.condition}` : ''} — click to edit condition`}
        type="button"
      >
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
};

export type FlowCardData = {
  label: string;
  section?: string;
  /** Compact rendering for the sidebar (smaller, no kind badge or metadata). */
  compact?: boolean;
  /** Y (px) anchors of the container routing ports: `gs` (entry/copy/fan-out) and `gt`
      (merge/fan-in). Level with a child's connector row for sequential flows, children-area
      centre for fans. */
  portOutY?: number;
  portInY?: number;
  collapsible?: boolean;
  collapsed?: boolean;
  childCount?: number;
  /** Nesting level (0 = top-level); alternates the surface so adjacent levels don't blend. */
  depth?: number;
  labelText?: string;
  topics?: string[];
  meta?: NodeMetaEntry[];
  missingTopic?: boolean;
  missingSasl?: boolean;
  // Routing into this branch (switch/fallback). Shown as a chip on the card.
  condition?: string;
  isDefault?: boolean;
  isErrorPath?: boolean;
  // A `switch` case wrapper — rendered as a condition-forward "case" card.
  isCase?: boolean;
  // Logical parent (parser parentId) used for selection/scope when the node carries no
  // React Flow `parentId` (the block layout positions everything absolutely).
  ownerId?: string;
  // Lane-label header variant (see the layout's `LaneLabelVariant`).
  variant?: 'case' | 'route' | 'stage' | 'name' | 'plain';
  // Lane band: an error/dead-letter lane is tinted red.
  isError?: boolean;
  editTarget?: EditTarget;
  /** Edit target for this node's switch CASE (routing condition), distinct from `editTarget`
      (the component). Drives the clickable condition chip. */
  caseEditTarget?: EditTarget;
  /** Highlighted because it's the node (component) selected in the inspector. */
  selected?: boolean;
  /** The CASE condition (not the component) is selected — highlight just the condition row. */
  conditionSelected?: boolean;
  /** Briefly pulse this node (e.g. after an undo/redo touched it). */
  flash?: boolean;
  /** Changes on each flash so the pulse animation replays. */
  flashToken?: number;
  /** New this render (e.g. revealed by expanding a container) — fades and grows in place
      rather than sliding from the origin. */
  appeared?: boolean;
  /** Lint messages from the server that map to this node's config. */
  lintErrors?: string[];
  // Injected by the canvas (edit mode only).
  onToggle?: () => void;
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  /** Open the case editor for this node's routing condition (clicking the chip). */
  onEditCondition?: () => void;
  /** A fan construct's in-card add affordance ("Add case" / "Add input"): payload + label. */
  addAction?: { payload: FlowInsertPayload; label: string };
  /** Invoke the add affordance (wired by the canvas in edit mode). */
  onAddChild?: () => void;
};

const HANDLE_IDS = [
  { id: 'l', position: Position.Left, type: 'target' },
  { id: 't', position: Position.Top, type: 'target' },
  { id: 'r', position: Position.Right, type: 'source' },
  { id: 'b', position: Position.Bottom, type: 'source' },
] as const;

const NodeHandles = () => (
  <>
    {HANDLE_IDS.map((h) => {
      const horizontal = h.id === 'l' || h.id === 'r';
      // Horizontal (left/right) handles use React Flow's DEFAULT vertical centering (no style
      // override), so a graph edge attaches at the card's vertical CENTRE — arrowheads land in
      // the middle of the node, not a top/bottom corner, and a same-rank spine reads straight.
      // Vertical (top/bottom) handles stay pinned to a fixed left offset (transform cleared) so
      // vertically-stacked cards of differing widths connect on a straight vertical line.
      const style = horizontal ? undefined : { left: SPINE_HANDLE_LEFT, transform: 'none' };
      return (
        <Handle className={invisibleHandle} id={h.id} key={h.id} position={h.position} style={style} type={h.type} />
      );
    })}
  </>
);

// Internal ports so flow visibly threads through a container: `gs` emits the entry / copy /
// fan-out edges to children; `gt` receives merge-back / fan-in. The layout computes their exact
// y so sequential lines run level with the first/last child's connector row (clear of the
// header) and fan trunks anchor at the children-area centre.
const HEADER_PORT_TOP = 22;
const ContainerHandles = ({ gsTop, gtTop }: { gsTop?: number; gtTop?: number }) => (
  <>
    <NodeHandles />
    <Handle
      className={invisibleHandle}
      id="gs"
      position={Position.Right}
      style={{ left: 0, top: gsTop ?? HEADER_PORT_TOP }}
      type="source"
    />
    <Handle
      className={invisibleHandle}
      id="gt"
      position={Position.Left}
      style={{ right: 0, left: 'auto', top: gtTop ?? HEADER_PORT_TOP }}
      type="target"
    />
  </>
);

// Kafka/Redpanda topics as scannable chips — the single most useful fact for a source or sink.
// Capped so a long topic list doesn't blow out the card.
const TOPIC_CHIP_LIMIT = 4;
const TopicChips = ({ topics }: { topics?: string[] }) => {
  if (!topics?.length) {
    return null;
  }
  const shown = topics.slice(0, TOPIC_CHIP_LIMIT);
  const extra = topics.length - shown.length;
  return (
    <div className="flex items-baseline gap-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{topics.length === 1 ? 'topic' : 'topics'}</span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {shown.map((topic) => (
          <Badge className="max-w-full" key={topic} size="sm" title={topic} variant="neutral-inverted">
            <span className="truncate font-mono">{topic}</span>
          </Badge>
        ))}
        {extra > 0 ? <span className="self-center text-[10px] text-muted-foreground">+{extra}</span> : null}
      </span>
    </div>
  );
};

// Whether a leaf card renders any meta rows (config preview / topics / missing chips).
function cardHasMeta(data: FlowCardData): boolean {
  return Boolean(data.meta?.length || data.topics?.length || data.missingTopic || data.missingSasl);
}

const MetaRows = ({ data }: { data: FlowCardData }) => {
  if (!cardHasMeta(data)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <TopicChips topics={data.topics} />
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

// A compact sidebar card: logo + name, with the label on its own row beneath so neither it nor
// the name gets truncated against the other.
const CompactCard = ({ data }: { data: FlowCardData }) => (
  <div className="group flex flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 shadow-sm transition-shadow hover:shadow-md">
    <div className="flex items-center gap-2">
      <ConnectorLogo className="size-4 shrink-0" fallback={Box} name={data.label as ComponentName} />
      <Text as="span" className="min-w-0 flex-1 truncate font-medium text-sm" title={data.label}>
        {data.label}
      </Text>
    </div>
    {data.labelText ? <LabelBadge className="max-w-full self-start" label={data.labelText} /> : null}
  </div>
);

// The selection ring on the node the inspector is editing. Uses `primary`; the node also reads
// clearly because its wiring is emphasized while unrelated edges dim.
const SELECTED_RING = 'ring-2 ring-primary ring-offset-1 ring-offset-background';
// An error ring for nodes with lint problems (takes precedence over selection).
const ERROR_RING = 'ring-2 ring-destructive ring-offset-1 ring-offset-background';

function cardRing(data: FlowCardData): string {
  if (data.lintErrors?.length) {
    return ERROR_RING;
  }
  return data.selected ? SELECTED_RING : '';
}

// A brief double-pulse ring drawn after an undo/redo touched a node. Uses the `brand`
// (orange-red) token — a transient "this just changed" highlight, distinct from selection
// (primary) and errors (destructive). Keyed by `token` so re-flashing replays the animation.
const FlashPulse = ({ token }: { token?: number }) => (
  <motion.span
    animate={{ opacity: [0, 1, 0.3, 1, 0] }}
    aria-hidden
    className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-2 ring-brand"
    initial={{ opacity: 0 }}
    key={token}
    transition={{ duration: 1.2, ease: 'easeOut', times: [0, 0.15, 0.5, 0.7, 1] }}
  />
);

// A small red chip with the count of lint problems on a node; messages are the native tooltip.
const LintBadge = ({ errors }: { errors?: string[] }) =>
  errors && errors.length > 0 ? (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 font-medium text-[10px] text-destructive"
      title={errors.join('\n')}
    >
      <AlertCircle className="size-3" />
      {errors.length}
    </span>
  ) : null;

// The component's `label:` — shown on every node (leaf, container, sidebar) when set.
const LabelBadge = ({ label, className }: { label?: string; className?: string }) =>
  label ? (
    <Badge className={cn('min-w-0 max-w-full shrink-0', className)} size="sm" title={label} variant="info-inverted">
      <span className="truncate">{label}</span>
    </Badge>
  ) : null;

// A leaf component card. The whole card is the click target (selection via RF's onNodeClick);
// editing happens in the inspector rail.
const ComponentCard = ({ data, selectable }: { data: FlowCardData; selectable?: boolean }) => {
  const kindLabel = SECTION_LABEL[data.section ?? ''] ?? '';
  const accent = SECTION_ACCENT[data.section ?? ''];
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md',
        selectable && 'cursor-pointer',
        cardRing(data)
      )}
    >
      {/* A switch case's routing condition sits at the TOP — "WHEN <check> → this node" — making
          the editable condition the first, most obvious section to click. */}
      {data.caseEditTarget ? (
        <ConditionRow data={data} onEdit={data.onEditCondition} selected={data.conditionSelected} />
      ) : null}
      {/* Tinted title band carries the role colour; the body below stays clean. */}
      <div className="border-border/60 border-b" style={headerTintStyle(accent)}>
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
          <Text
            as="span"
            className="shrink-0 uppercase tracking-wide"
            style={accent ? { color: accent } : undefined}
            variant="captionStrongMedium"
          >
            {kindLabel}
          </Text>
          {/* Non-case condition info (rare, e.g. an error-lane tint) stays an inline chip; a
              switch case's condition gets the prominent row above instead. */}
          {data.caseEditTarget ? null : <BranchConditionChip data={data} onEdit={data.onEditCondition} />}
          <LintBadge errors={data.lintErrors} />
        </div>
        <div className="flex w-full items-center gap-2 px-3 pb-2.5 text-left">
          <LogoTile name={data.label} />
          <Text
            as="span"
            className="min-w-0 flex-1 truncate font-semibold"
            title={data.label}
            variant="bodyStrongMedium"
          >
            {data.label}
          </Text>
        </div>
      </div>
      {data.labelText ? (
        // When no meta rows follow, the label badge is the last row — bottom inset so it isn't flush.
        <div className={cn('px-3 pt-2', cardHasMeta(data) ? '' : 'pb-3')}>
          <LabelBadge label={data.labelText} />
        </div>
      ) : null}
      <MetaRows data={data} />
    </div>
  );
};

const FlowCardNode = ({ data }: { data: FlowCardData }) => {
  const isPlaceholder = data.label === 'none';
  const ref = useStopPanOnControls();
  const width = data.compact ? FLOW_COMPACT_CARD_WIDTH : FLOW_CARD_WIDTH;
  // Leaves on the full canvas are selectable; placeholders and the compact sidebar aren't.
  const selectable = !(isPlaceholder || data.compact);

  const card = (() => {
    if (isPlaceholder) {
      return <PlaceholderCard data={data} />;
    }
    return data.compact ? <CompactCard data={data} /> : <ComponentCard data={data} selectable={selectable} />;
  })();

  return (
    <div className={cn('group relative', data.appeared && APPEAR_ANIM)} ref={ref} style={{ width }}>
      <NodeHandles />
      {card}
      {data.flash ? <FlashPulse token={data.flashToken} /> : null}
    </div>
  );
};

// The logo + kind / name of a container's title bar — compact is one row, full stacks the
// coloured kind label above the name.
const ContainerTitleText = ({ data, accent }: { data: FlowCardData; accent?: string }) => {
  if (data.compact) {
    return (
      <Text as="span" className="min-w-0 flex-1 truncate font-medium text-sm" title={data.label}>
        {data.label}
      </Text>
    );
  }
  const kindLabel = SECTION_LABEL[data.section ?? ''] ?? '';
  return (
    // flex-1 + min width: the title claims leftover space and isn't crushed to a sliver by a
    // long condition chip (the chip truncates instead).
    <span className="flex min-w-12 flex-1 flex-col">
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

// A switch case's title: a "CASE N" eyebrow above its routing condition on a full-width mono
// line. Cases are structural (no connector logo), which also signals they aren't editable.
const CaseTitle = ({ data }: { data: FlowCardData }) => {
  const isError = data.isErrorPath;
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <Text
        as="span"
        className={cn(
          'text-[10px] uppercase leading-none tracking-wide',
          isError ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {data.label}
      </Text>
      {data.condition ? (
        <span
          className={cn(
            'min-w-0 truncate font-medium font-mono text-xs',
            isError ? 'text-destructive' : 'text-foreground'
          )}
          title={data.condition}
        >
          {data.condition}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs italic">default · fallback</span>
      )}
    </span>
  );
};

// Leading content of a container header: a switch case shows its condition front-and-centre
// (no logo); every other container shows logo + kind / name + label + condition chip.
const ContainerHeaderTitle = ({ data, accent }: { data: FlowCardData; accent?: string }) => {
  if (data.isCase) {
    return <CaseTitle data={data} />;
  }
  return (
    <>
      <LogoTile compact={data.compact} name={data.label} />
      <ContainerTitleText accent={accent} data={data} />
      <LabelBadge className="max-w-[35%]" label={data.labelText} />
      <BranchConditionChip className="max-w-[45%]" data={data} onEdit={data.onEditCondition} />
    </>
  );
};

// A container processor (branch/switch/parallel/…) or multi-input broker: a titled box that
// encloses its children. RF renders the children inside; this only draws the chrome (title bar + border).
const FlowContainerNode = ({ data }: { data: FlowCardData }) => {
  const ref = useStopPanOnControls();
  const accent = SECTION_ACCENT[data.section ?? ''];
  // The full-canvas container header is the selection click target; the compact sidebar isn't.
  const selectable = !data.compact;

  return (
    // Handles live on this border-less wrapper so their `left`/`top` offsets are measured from
    // the node's outer edge — identical to leaf cards. (On the bordered box below they'd shift by
    // the border width and angle the spine between cards and containers.)
    <div className={cn('group relative h-full w-full', data.appeared && APPEAR_ANIM)} ref={ref}>
      <ContainerHandles gsTop={data.portOutY} gtTop={data.portInY} />
      {data.flash ? <FlashPulse token={data.flashToken} /> : null}
      <div
        className={cn(
          // Grouping frame whose surface alternates by nesting depth so a container is never the
          // same shade as its parent. Opaque fill (a color-mix, not an alpha wash) so nesting
          // never compounds to mud; a hairline border + soft shadow outline each frame.
          'flex h-full w-full flex-col rounded-lg border border-border shadow-sm',
          cardRing(data)
        )}
        style={{ backgroundColor: containerSurface(data.depth ?? 0) }}
      >
        <div
          className={cn(
            'flex items-center gap-2',
            selectable && 'cursor-pointer',
            data.compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
            // Header uses the box's own (depth-alternating) surface, with a divider from the body.
            // Collapsed: the header is the whole card (centred, no divider) so spine arrows hit its middle.
            data.collapsed ? 'h-full rounded-lg' : 'rounded-t-lg border-border/60 border-b'
          )}
        >
          <ContainerHeaderTitle accent={accent} data={data} />
          <LintBadge errors={data.lintErrors} />
          {/* Separate control so the toggle doesn't also select the node; 28px hit area for easy targeting. */}
          {data.collapsible ? (
            <button
              aria-label={data.collapsed ? 'Expand' : 'Collapse'}
              className="nodrag nopan -my-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => {
                e.stopPropagation();
                data.onToggle?.();
              }}
              type="button"
            >
              {data.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : null}
          {data.collapsed && data.childCount ? <CountDot count={data.childCount} size="sm" variant="disabled" /> : null}
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

export type FlowInsertData = {
  label?: string;
  payload?: FlowInsertPayload;
  /** A "ghost branch" add (e.g. Add case) reached by a dashed connector — styled as a pill. */
  ghost?: boolean;
  // Injected by the canvas (edit mode only). Absent in read-only mode → not rendered.
  onInsert?: (payload: FlowInsertPayload) => void;
};

// An "add" affordance: a quiet "+" button. As a ghost branch (Add case / Add input) it's a
// dashed pill reached by a faint connector; inline it's a plain "+". Edit mode only. The l/r
// handles let the ghost connector edge attach.
const FlowInsertNode = ({ data }: { data: FlowInsertData }) => {
  if (!(data.onInsert && data.payload)) {
    return null;
  }
  const payload = data.payload;
  const handlePin = { top: 12, transform: 'none' } as const;
  return (
    <>
      <Handle className={invisibleHandle} id="l" position={Position.Left} style={handlePin} type="target" />
      <Handle className={invisibleHandle} id="r" position={Position.Right} style={handlePin} type="source" />
      <button
        aria-label={data.label ?? 'Add'}
        className={cn(
          'nodrag nopan flex h-full w-full cursor-pointer items-center gap-1.5 px-2 font-medium text-primary text-xs transition-colors',
          data.ghost
            ? 'justify-center rounded-full border border-primary/40 border-dashed bg-background hover:border-primary hover:bg-primary/10'
            : 'rounded-md hover:bg-primary/10'
        )}
        onClick={() => data.onInsert?.(payload)}
        type="button"
      >
        <PlusIcon className="size-3" />
        {data.label}
      </button>
    </>
  );
};

export function FlowSpineEdge({ sourceX, sourceY, targetX, targetY, markerEnd, data }: EdgeProps) {
  // The spine runs along a single row, so a straight line reads cleanest.
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const d = data as { onInsert?: () => void; dimmed?: boolean; emphasized?: boolean } | undefined;
  const onInsert = d?.onInsert;
  return (
    <>
      {/* A faint static rail; the moving particles on top are the dominant element so flow
          direction reads (a full-opacity base would swallow the motion). Dimmed when unrelated to the selection. */}
      <BaseEdge
        markerEnd={markerEnd}
        path={path}
        style={{
          stroke: 'var(--color-primary)',
          strokeWidth: d?.emphasized ? 2.5 : 1.5,
          opacity: d?.dimmed ? 0.2 : 0.4,
        }}
      />
      {/* Marching particles show which way data flows; dropped on edges unrelated to the selection. */}
      {d?.dimmed ? null : (
        <path
          className="pipeline-flow-dash"
          d={path}
          fill="none"
          stroke="var(--color-primary)"
          strokeDasharray="2 8"
          strokeLinecap="round"
          strokeWidth={d?.emphasized ? 3.5 : 2.5}
          style={{ opacity: 1, pointerEvents: 'none' }}
        />
      )}
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
type FlowLinkData = {
  label?: string;
  labelOffsetY?: number;
  tone?: LinkTone;
  dashed?: boolean;
  laneFromSource?: number;
  laneFromTarget?: number;
  /** Draw a small "port" socket at the container end so the line visibly plugs in. */
  portDot?: 'source' | 'target';
  /** Selection context: unrelated edges fade, connected ones render full strength. */
  dimmed?: boolean;
  emphasized?: boolean;
  /** Idle reference edges: readable hint, softer than full strength. */
  faint?: boolean;
  /** Orthogonal cable route (reference edges): drop → channel beside the column → down it →
      along the bus below the flow → into the resource. */
  route?: { channelX: number; busY: number };
};

// An orthogonal polyline through `points` with rounded corners.
function orthogonalRoundedPath(points: [number, number][], radius = 8): string {
  const pts = points.filter(([x, y], i) => i === 0 || x !== points[i - 1][0] || y !== points[i - 1][1]);
  if (pts.length < 2) {
    return '';
  }
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.abs(cx - px) + Math.abs(cy - py);
    const outLen = Math.abs(nx - cx) + Math.abs(ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const inX = cx - Math.sign(cx - px) * r;
    const inY = cy - Math.sign(cy - py) * r;
    const outX = cx + Math.sign(nx - cx) * r;
    const outY = cy + Math.sign(ny - cy) * r;
    d += ` L ${inX} ${inY} Q ${cx} ${cy} ${outX} ${outY}`;
  }
  const [lx, ly] = pts.at(-1) as [number, number];
  return `${d} L ${lx} ${ly}`;
}

// A reference edge's cable route: short drop out of the node, across to the clear channel beside
// its column, down the channel, along the bus below the flow, into the resource — never crossing cards.
function referenceRoutePath(
  route: { channelX: number; busY: number },
  coords: { sx: number; sy: number; tx: number; ty: number }
): string {
  const { sx, sy, tx, ty } = coords;
  const drop = sy + 14;
  return orthogonalRoundedPath([
    [sx, sy],
    [sx, drop],
    [route.channelX, drop],
    [route.channelX, route.busY],
    [tx, route.busY],
    [tx, ty],
  ]);
}

const HIGHLIGHT_STROKE = 'var(--color-primary)';

// Line colour for an edge's state: highlighted (selection/hover) edges render in `primary` to
// match the ring — except error edges, whose red wins. Idle reference edges use muted-foreground.
function strokeFor(d: FlowLinkData | undefined): string {
  const tone = d?.tone ?? 'muted';
  if (d?.emphasized && tone !== 'error') {
    return HIGHLIGHT_STROKE;
  }
  if (d?.faint) {
    return 'var(--color-muted-foreground)';
  }
  return LINK_STROKE[tone];
}

// Stroke styling from edge data. Idle edges stay light; an emphasized (selected/hovered) edge
// jumps to a heavier weight so it stands out.
function linkStyle(d: FlowLinkData | undefined): React.CSSProperties {
  const tone = d?.tone ?? 'muted';
  const baseWidth = tone === 'muted' ? 1.25 : 1.5;
  let opacity = 1;
  if (d?.dimmed) {
    opacity = 0.25;
  } else if (d?.faint) {
    opacity = 0.6;
  }
  return {
    stroke: strokeFor(d),
    strokeWidth: d?.emphasized ? baseWidth + 1 : baseWidth,
    strokeDasharray: d?.dashed ? '5 4' : undefined,
    opacity,
  };
}

const LINK_STROKE: Record<LinkTone, string> = {
  primary: 'var(--color-primary)',
  muted: 'var(--color-border)',
  error: 'var(--color-destructive)',
};

// The container-side endpoint of an entry/copy/merge/fan edge, drawn as a small socket so the
// line visibly plugs into the container instead of trailing off it.
const PortDot = ({ x, y, color, dimmed }: { x: number; y: number; color: string; dimmed?: boolean }) => (
  <circle
    cx={x}
    cy={y}
    fill="var(--color-background)"
    opacity={dimmed ? 0.25 : 1}
    r={3.5}
    stroke={color}
    strokeWidth={1.5}
  />
);

// Every non-spine edge: container entry/chain, fan-out (with a routing-condition label), branch
// copy/merge (dashed), error/DLQ (red dashed), resource references (muted dashed). Styled by edge `data`.
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
  const d = data as FlowLinkData | undefined;
  const tone = d?.tone ?? 'muted';
  // Place the vertical bend in this edge's own lane so fanned siblings don't share (and overlap on) a trunk.
  let centerX: number | undefined;
  if (d?.laneFromSource !== undefined) {
    centerX = sourceX + d.laneFromSource;
  } else if (d?.laneFromTarget !== undefined) {
    centerX = targetX - d.laneFromTarget;
  }
  const [smoothPath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    // Smaller than the tightest fan lane (14px) so a lane near the port can't make the default
    // 20px approach stub jog the line left then back right.
    offset: 8,
    ...(centerX === undefined ? {} : { centerX }),
  });
  // Reference cables follow an explicit orthogonal route (channel + bus); everything else is a smooth step.
  const path = d?.route
    ? referenceRoutePath(d.route, { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY })
    : smoothPath;
  return (
    <>
      <BaseEdge markerEnd={markerEnd} path={path} style={linkStyle(d)} />
      {d?.portDot ? (
        <PortDot
          color={strokeFor(d)}
          dimmed={d.dimmed}
          x={d.portDot === 'source' ? sourceX : targetX}
          y={d.portDot === 'source' ? sourceY : targetY}
        />
      ) : null}
      {d?.label ? <LinkLabel d={d} tone={tone} x={labelX} y={labelY + (d.labelOffsetY ?? 0)} /> : null}
    </>
  );
}

// Tone-matched label styling so copy/merge/error tags read clearly against the stacked (and
// progressively darker) nested-container backgrounds: a solid pill, a tinted border, and text in
// the edge's own colour rather than low-contrast gray.
const LINK_LABEL_STYLE: Record<LinkTone, string> = {
  primary: 'border-primary/40 text-primary',
  error: 'border-destructive/40 text-destructive',
  muted: 'border-border text-foreground',
};
// RF renders every edge label into one shared `edgelabel-renderer` layer below the nodes layer,
// while each edge's SVG inherits an elevated z-index from the (nested) node it touches. So a
// copy/merge label in a container's gutter would paint behind the card even though its line and
// port socket paint in front. Lifting the pill above the cards keeps it readable. (Nodes here
// aren't selectable, so their z-indices stay well under this.)
const LINK_LABEL_Z = 1000;
const LinkLabel = ({
  d,
  tone,
  x,
  y,
  onClick,
}: {
  d: FlowLinkData;
  tone: LinkTone;
  x: number;
  y: number;
  onClick?: () => void;
}) => {
  const className = cn(
    // Condition labels are Bloblang code (e.g. `this.fraud.score > 0.9`): mono, not uppercased,
    // so they match the card's condition chips.
    'nodrag nopan absolute max-w-[200px] truncate rounded border bg-background px-1.5 py-0.5 font-medium font-mono text-[10px] shadow-sm',
    LINK_LABEL_STYLE[tone],
    // A condition label is clickable to edit its case — make that obvious.
    onClick && 'pointer-events-auto cursor-pointer transition-colors hover:bg-muted'
  );
  const style = {
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
    opacity: d.dimmed ? 0.25 : 1,
    zIndex: LINK_LABEL_Z,
  } as const;
  return (
    <EdgeLabelRenderer>
      {onClick ? (
        <button className={className} onClick={onClick} style={style} title={d.label} type="button">
          {d.label}
        </button>
      ) : (
        <div className={className} style={style} title={d.label}>
          {d.label}
        </div>
      )}
    </EdgeLabelRenderer>
  );
};

// Control-flow processors (branch/switch/try/for_each/…) have no logo and no config meta — they
// route through a sub-pipeline. Each gets a glyph + a one-line descriptor (count of cases / steps
// / stages, or its routing role) so the marker reads as a router, not an empty card.
type ControlFlowPresentation = { Icon: LucideIcon; descriptor: string };

function plural(n: number, noun: string): string {
  const many = noun.endsWith('h') ? `${noun}es` : `${noun}s`;
  return `${n} ${n === 1 ? noun : many}`;
}

// Per-construct glyph + descriptor recipe: `noun` is counted (e.g. "3 cases"), `prefix` precedes
// the count, `zero` is the fallback with no count (or no `noun`).
type ControlFlowSpec = { icon: LucideIcon; noun?: string; prefix?: string; zero: string };
const CONTROL_FLOW_SPECS: Record<string, ControlFlowSpec> = {
  switch: { icon: Split, noun: 'case', zero: 'router' },
  branch: { icon: GitBranch, noun: 'step', prefix: 'enrich · ', zero: 'enrich' },
  try: { icon: ShieldCheck, noun: 'step', zero: 'guarded' },
  catch: { icon: ShieldAlert, zero: 'on error' },
  for_each: { icon: Repeat, noun: 'step', prefix: 'per item · ', zero: 'per item' },
  while: { icon: RotateCw, noun: 'step', prefix: 'loop · ', zero: 'loop' },
  retry: { icon: RotateCw, noun: 'step', prefix: 'retry · ', zero: 'retry' },
  group_by: { icon: Layers, noun: 'step', zero: 'grouped' },
  parallel: { icon: Rows3, noun: 'branch', zero: 'parallel' },
  workflow: { icon: Workflow, noun: 'stage', zero: 'workflow' },
  fallback: { icon: Shuffle, noun: 'tier', zero: 'fallback' },
};

function controlFlowPresentation(data: FlowCardData): ControlFlowPresentation {
  const count = data.childCount ?? 0;
  // A broker/sequence counts its sinks or sources, per section.
  if (data.label === 'broker' || data.label === 'sequence') {
    const noun = data.section === 'output' ? 'output' : 'input';
    return { Icon: Network, descriptor: count ? plural(count, noun) : 'broker' };
  }
  const spec = CONTROL_FLOW_SPECS[data.label];
  if (!spec) {
    return { Icon: GitFork, descriptor: count ? plural(count, 'step') : 'routes' };
  }
  if (!(spec.noun && count)) {
    return { Icon: spec.icon, descriptor: spec.zero };
  }
  return { Icon: spec.icon, descriptor: `${spec.prefix ?? ''}${plural(count, spec.noun)}` };
}

// A filled accent tile holding the control-flow glyph — distinct from the white connector
// `LogoTile` so a router/scope marker never reads as a data card.
const ControlFlowIconTile = ({ Icon, accent }: { Icon: LucideIcon; accent: string }) => (
  <span
    className="flex size-7 shrink-0 items-center justify-center rounded-md border"
    style={{
      borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
      backgroundColor: `color-mix(in srgb, ${accent} 14%, var(--color-card))`,
      color: accent,
    }}
  >
    <Icon className="size-4" />
  </span>
);

// A control-flow processor (switch / branch / try / parallel / …) as a compact card. It never
// wraps children — in the Dagre graph its branches fan out as labelled edges and reconverge at a
// merge node. The card is the fan-out / scope marker: glyph + name + descriptor (N cases / N steps).
const FlowSplitNode = ({ data }: { data: FlowCardData }) => {
  const ref = useStopPanOnControls();
  const isError = Boolean(data.isErrorPath);
  const accent = isError ? 'var(--color-destructive)' : (SECTION_ACCENT[data.section ?? ''] ?? 'var(--color-primary)');
  const { Icon, descriptor } = controlFlowPresentation(data);
  return (
    <div className={cn('group relative', data.appeared && APPEAR_ANIM)} ref={ref} style={{ width: FLOW_CARD_WIDTH }}>
      <NodeHandles />
      {data.flash ? <FlashPulse token={data.flashToken} /> : null}
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md',
          cardRing(data)
        )}
      >
        {/* A switch-case ENTRY's routing condition sits at the TOP — "WHEN <check> → this
            construct" — the first, most obvious section to click (like leaf cards). */}
        {data.caseEditTarget ? (
          <ConditionRow data={data} onEdit={data.onEditCondition} selected={data.conditionSelected} />
        ) : null}
        <div className="flex cursor-pointer items-center gap-2.5 px-3 py-2" style={headerTintStyle(accent)}>
          <ControlFlowIconTile accent={accent} Icon={Icon} />
          <span className="flex min-w-0 flex-1 flex-col">
            <Text
              as="span"
              className="truncate text-[10px] uppercase leading-none tracking-wide"
              style={{ color: accent }}
              title={descriptor}
              variant="captionStrongMedium"
            >
              {descriptor}
            </Text>
            <Text
              as="span"
              className="min-w-0 truncate font-semibold leading-tight"
              title={data.label}
              variant="bodyStrongMedium"
            >
              {data.label}
            </Text>
          </span>
          {data.labelText ? <LabelBadge className="max-w-[32%]" label={data.labelText} /> : null}
          <LintBadge errors={data.lintErrors} />
        </div>
        {/* "Add case / Add input" lives INSIDE the construct card as a footer row (clearly tied to
            the node) rather than a floating pill below it. Edit mode only. */}
        {data.addAction && data.onAddChild ? (
          <button
            className="nodrag nopan flex w-full cursor-pointer items-center justify-center gap-1.5 border-border/70 border-t border-dashed px-3 py-1.5 font-medium text-primary text-xs transition-colors hover:bg-primary/5"
            onClick={(e) => {
              e.stopPropagation();
              data.onAddChild?.();
            }}
            type="button"
          >
            <PlusIcon className="size-3.5" />
            {data.addAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
};

// The join point where a fan's branches reconverge: a small circular node in the primary colour.
// Fan-in edges plug into its left, flow leaves its right. A filled primary-tint disc (not a hollow
// ring) so it reads as a deliberate "join" rather than a stray dot.
const FlowMergeNode = () => {
  const handle = { top: 16, transform: 'none' } as const;
  return (
    <div className="relative flex h-8 items-center justify-center" style={{ width: 48 }}>
      <Handle className={invisibleHandle} id="l" position={Position.Left} style={handle} type="target" />
      <Handle className={invisibleHandle} id="r" position={Position.Right} style={handle} type="source" />
      <Handle
        className={invisibleHandle}
        id="t"
        position={Position.Top}
        style={{ left: 24, transform: 'none' }}
        type="target"
      />
      <span
        className="flex size-8 items-center justify-center rounded-full border-2 shadow-sm"
        style={{
          borderColor: 'var(--color-primary)',
          backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, var(--color-background))',
        }}
        title="Join — branches reconverge here"
      >
        <GitMerge className="size-4 text-primary" />
      </span>
    </div>
  );
};

// A "+" button at an edge's midpoint (edit mode) for inserting a step there.
const EdgeInsertButton = ({ x, y, onInsert }: { x: number; y: number; onInsert: () => void }) => (
  <EdgeLabelRenderer>
    <button
      aria-label="Insert a step"
      className="nodrag nopan pointer-events-auto absolute flex size-6 cursor-pointer items-center justify-center rounded-full border border-primary bg-background text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
      onClick={onInsert}
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, zIndex: 1001 }}
      type="button"
    >
      <PlusIcon className="size-3.5" />
    </button>
  </EdgeLabelRenderer>
);

type FlowGraphEdgeData = {
  graphType?: string;
  tone?: LinkTone;
  dashed?: boolean;
  label?: string;
  points?: { x: number; y: number }[];
  insertIndex?: number;
  animated?: boolean;
  dimmed?: boolean;
  emphasized?: boolean;
  faint?: boolean;
  onInsert?: () => void;
  /** Click the (condition) label to select+edit its case. */
  onLabelClick?: () => void;
  /** Where along the edge (0–1) the label sits; defaults to the midpoint. */
  labelT?: number;
  /** A faint, decorative "ghost" edge — drawn lighter. */
  ghost?: boolean;
};

// The point at fraction `t` (0–1) of the polyline's arc length — so an edge label / "+" sits ON
// the line (a raw middle waypoint can sit well off a curved edge). t=0.5 = midpoint.
function polylinePointAt(points: { x: number; y: number }[], t = 0.5): { x: number; y: number } {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  const segLen = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = segLen.reduce((a, b) => a + b, 0);
  let dist = total * Math.min(Math.max(t, 0), 1);
  for (let i = 0; i < segLen.length; i += 1) {
    if (dist <= segLen[i]) {
      const f = segLen[i] === 0 ? 0 : dist / segLen[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * f,
        y: points[i].y + (points[i + 1].y - points[i].y) * f,
      };
    }
    dist -= segLen[i];
  }
  return points.at(-1) as { x: number; y: number };
}

// Smooth a polyline through Dagre's node-avoiding waypoints (quadratic segments via midpoints).
// Following Dagre's routed points is what keeps lines clear of the cards.
function smoothGraphPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) {
    return '';
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += ` Q ${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`;
  }
  const last = points.at(-1) as { x: number; y: number };
  return `${d} L ${last.x} ${last.y}`;
}

// Every edge in the Dagre DAG: routed through Dagre's waypoints (so lines avoid nodes), styled by
// type — solid primary for flow, marching dashes for live data, red dashed for error/dead-letter,
// dashed for branch copy/merge and resource refs.
export function FlowGraphEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const d = data as FlowGraphEdgeData | undefined;
  let path: string;
  // `label*` is where a condition label sits (often near its target); `insert*` is the on-edge "+" (midpoint).
  let labelX: number;
  let labelY: number;
  let insertX: number;
  let insertY: number;
  const dagrePts = d?.points;
  if (dagrePts && dagrePts.length >= 2) {
    // Cap Dagre's routed waypoints with the real handle endpoints for a clean attach.
    const pts = [{ x: sourceX, y: sourceY }, ...dagrePts.slice(1, -1), { x: targetX, y: targetY }];
    path = smoothGraphPath(pts);
    const labelPos = polylinePointAt(pts, d?.labelT ?? 0.5);
    const insertPos = polylinePointAt(pts, 0.5);
    labelX = labelPos.x;
    labelY = labelPos.y;
    insertX = insertPos.x;
    insertY = insertPos.y;
  } else {
    const [p, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 10,
    });
    path = p;
    labelX = lx;
    labelY = ly;
    insertX = lx;
    insertY = ly;
  }
  const tone: LinkTone = d?.tone ?? 'muted';
  let stroke = LINK_STROKE[tone];
  if (d?.emphasized && tone !== 'error') {
    stroke = HIGHLIGHT_STROKE;
  } else if (d?.faint) {
    stroke = 'var(--color-muted-foreground)';
  }
  let opacity = 1;
  if (d?.dimmed) {
    opacity = 0.25;
  } else if (d?.ghost) {
    opacity = 0.4;
  } else if (d?.faint) {
    opacity = 0.6;
  }
  const width = d?.emphasized ? 2.5 : 1.75;
  return (
    <>
      <BaseEdge
        markerEnd={markerEnd}
        path={path}
        style={{ stroke, strokeWidth: width, strokeDasharray: d?.dashed ? '5 4' : undefined, opacity }}
      />
      {d?.animated && !d?.dimmed ? (
        <path
          className="pipeline-flow-dash"
          d={path}
          fill="none"
          stroke={stroke}
          strokeDasharray="2 8"
          strokeLinecap="round"
          strokeWidth={d?.emphasized ? 3 : 2}
          style={{ opacity: 0.9, pointerEvents: 'none' }}
        />
      ) : null}
      {d?.label ? (
        <LinkLabel
          d={{ label: d.label, tone, dimmed: d.dimmed }}
          onClick={d.onLabelClick}
          tone={tone}
          x={labelX}
          // When an on-edge "+" shares this midpoint, lift the label clear so the two don't
          // overprint (e.g. a new empty case's "default" over its add "+").
          y={d?.onInsert ? labelY - 18 : labelY}
        />
      ) : null}
      {d?.onInsert ? <EdgeInsertButton onInsert={d.onInsert} x={insertX} y={insertY} /> : null}
    </>
  );
}

export const flowNodeTypes = {
  flowCard: FlowCardNode,
  flowContainer: FlowContainerNode,
  flowSectionLabel: FlowSectionLabel,
  flowInsert: FlowInsertNode,
  flowSplit: FlowSplitNode,
  flowMerge: FlowMergeNode,
};

export const flowEdgeTypes = {
  flowSpine: FlowSpineEdge,
  flowLink: FlowLinkEdge,
  flowGraphEdge: FlowGraphEdge,
};
