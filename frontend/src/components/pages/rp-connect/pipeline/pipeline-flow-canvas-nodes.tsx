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
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  AlertCircle,
  Box,
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
import { FLOW_CARD_WIDTH, FLOW_SPINE_HANDLE_LEFT, type FlowInsertPayload } from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const invisibleHandle = '!w-1.5 !h-1.5 !border-0 !bg-transparent !min-w-0 !min-h-0';
// Applied to the card body, never the RF node wrapper — its `transform` drives positioning and
// would fight a scale/translate animation.
const APPEAR_ANIM = 'fade-in zoom-in-95 animate-in duration-200';

// RF drives pan/drag from native listeners on ancestors (d3-zoom/d3-drag); React's synthetic
// handlers run after and can't cancel the gesture. Attach native listeners and stop propagation
// only for presses on a real control, so buttons click while the card body still pans.
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

// Each role's colour identity via semantic tokens (theme-aware, readable as either fill or text):
// input → success, processor → informative, resource → warning. Output has no matching status token,
// so it borrows a chart accent.
const SECTION_ACCENT: Record<string, string> = {
  input: 'var(--color-success)',
  processor: 'var(--color-informative)',
  output: 'var(--color-chart-1)',
  resource: 'var(--color-warning)',
};

export function sectionAccent(section?: string): string | undefined {
  return section ? SECTION_ACCENT[section] : undefined;
}

// Role colour as a tinted title band (not a border) so it doesn't compete with the selection /
// error rings. Opaque (mixed over the card colour) so it layers on headers and leaf cards alike.
function headerTintStyle(accent?: string): React.CSSProperties | undefined {
  return accent ? { backgroundColor: `color-mix(in srgb, ${accent} 10%, var(--color-card))` } : undefined;
}

// The connector logo in a small elevated tile so it sits cleanly on the tinted header band.
const LogoTile = ({ name }: { name: string }) => (
  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background">
    <ConnectorLogo className="size-5" fallback={Box} name={name as ComponentName} />
  </span>
);

// A node's routing semantics as a chip: `if <check>`, `default`, or `on error` (red). Display-only;
// conditions are edited in the inspector panel.
const BranchConditionChip = ({ data, className }: { data: FlowCardData; className?: string }) => {
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
    'inline-flex min-w-0 max-w-full items-center rounded border px-1.5 py-0.5 font-medium text-caption-sm leading-none',
    tone === 'error' && 'border-destructive/40 bg-destructive/5 text-destructive',
    tone === 'muted' && 'border-warning/30 bg-warning/5 text-warning/80',
    tone === 'condition' && 'border-warning/40 bg-warning/10 text-warning',
    className
  );
  return (
    <span className={cls} title={text}>
      <span className="truncate">{text}</span>
    </span>
  );
};

// Routing conditions reuse the `warning` accent — distinct from section accents and the red error
// tone, so routing logic is easy to scan. Error routes keep red; a `default` catch-all is muted.
const CONDITION_ROW_TONE: Record<'condition' | 'muted' | 'error', string> = {
  condition: 'border-warning/30 bg-warning/10 text-warning',
  muted: 'border-warning/20 bg-warning/5 text-warning/80',
  error: 'border-destructive/20 bg-destructive/10 text-destructive',
};

// A switch case's routing condition on its own full-width row (more contrast than the inline
// header chip). Display-only; inset ring when the condition is selected.
const ConditionRow = ({ data, selected }: { data: FlowCardData; selected?: boolean }) => {
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
  return (
    <div
      className={cn(
        'flex w-full items-center gap-1.5 border-b px-3 py-1.5 text-left',
        CONDITION_ROW_TONE[tone],
        selected && 'ring-2 ring-primary ring-inset'
      )}
    >
      <Split className="size-3.5 shrink-0 opacity-80" />
      <span className="shrink-0 font-semibold text-caption-sm uppercase tracking-wide opacity-70">{eyebrow}</span>
      {data.condition ? (
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={data.condition}>
          {data.condition}
        </span>
      ) : null}
    </div>
  );
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
  // Routing into this branch (switch/fallback). Shown as a chip on the card.
  condition?: string;
  isDefault?: boolean;
  isErrorPath?: boolean;
  // A `switch` case wrapper — rendered as a condition-forward "case" card.
  isCase?: boolean;
  // Logical parent (parser parentId) used for selection/scope when the node carries no
  // React Flow `parentId` (the block layout positions everything absolutely).
  ownerId?: string;
  editTarget?: EditTarget;
  /** Edit target for this node's switch CASE (routing condition), distinct from `editTarget`
      (the component). Drives the clickable condition chip. */
  caseEditTarget?: EditTarget;
  /** Id of the case-wrapper node this entry stands in for (processor switch), so an unsaved
      condition edit — attributed to the wrapper — marks this card. */
  caseOwnerId?: string;
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
  /** Config differs from the last-saved pipeline — flagged with a warning-toned "unsaved" dot. */
  unsaved?: boolean;
  // Injected by the canvas (edit mode only).
  onToggle?: () => void;
  onAddConnector?: (section: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
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
      // Horizontal (l/r) handles keep RF's default vertical centering so a same-rank spine reads
      // straight. Vertical (t/b) handles pin to a fixed left offset so stacked cards of differing
      // widths connect on a straight line.
      const style = horizontal ? undefined : { left: FLOW_SPINE_HANDLE_LEFT, transform: 'none' };
      return (
        <Handle className={invisibleHandle} id={h.id} key={h.id} position={h.position} style={style} type={h.type} />
      );
    })}
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
        {extra > 0 ? <span className="self-center text-caption-sm text-muted-foreground">+{extra}</span> : null}
      </span>
    </div>
  );
};

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
      onClick={(e) => {
        // Adding the missing piece shouldn't also select the node.
        e.stopPropagation();
        onAdd();
      }}
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
  const section = data.section ?? 'connector';
  const onAdd = data.onAddConnector;
  // Read-only (no handler): plain descriptive text, not a disabled button that reads as
  // broken permissions.
  if (!onAdd) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-border border-dashed bg-card px-3 py-4 text-muted-foreground shadow-sm">
        <Text as="span" className="text-sm" variant="bodyMedium">
          No {section} configured
        </Text>
      </div>
    );
  }
  return (
    <button
      className="nodrag nopan group flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-border border-dashed bg-card px-3 py-4 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary hover:shadow-md"
      onClick={() => onAdd(data.section ?? '')}
      type="button"
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-current/40 bg-background/70 transition-colors group-hover:border-primary group-hover:bg-primary/10">
        <PlusIcon className="size-4" />
      </span>
      <Text as="span" className="font-medium text-sm" variant="bodyStrongMedium">
        Add {section}
      </Text>
    </button>
  );
};

// The selection ring on the node the inspector is editing.
const SELECTED_RING = 'ring-2 ring-primary ring-offset-1 ring-offset-background';
// An error ring for nodes with lint problems (takes precedence over selection).
const ERROR_RING = 'ring-2 ring-destructive ring-offset-1 ring-offset-background';

function cardRing(data: FlowCardData): string {
  if (data.lintErrors?.length) {
    return ERROR_RING;
  }
  return data.selected ? SELECTED_RING : '';
}

// A brief double-pulse ring after an undo/redo touched a node — the `brand` token, distinct from
// selection (primary) and errors (destructive). Keyed by `token` so re-flashing replays it.
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
      className="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 font-medium text-caption-sm text-destructive"
      title={errors.join('\n')}
    >
      <AlertCircle className="size-3" />
      {errors.length}
    </span>
  ) : null;

// A warning-toned dot marking a node whose config differs from the last-saved pipeline.
const UnsavedDot = ({ show }: { show?: boolean }) =>
  show ? (
    <span className="size-2 shrink-0 rounded-full bg-warning" title="Unsaved changes on this node">
      <span className="sr-only">Unsaved changes</span>
    </span>
  ) : null;

// The component's `label:` — shown on every node (leaf, container, sidebar) when set.
const LabelBadge = ({ label, className }: { label?: string; className?: string }) =>
  label ? (
    <Badge className={cn('min-w-0 max-w-full shrink-0', className)} size="sm" title={label} variant="info-inverted">
      <span className="truncate">{label}</span>
    </Badge>
  ) : null;

// A leaf component card. The whole card is the click target; editing happens in the inspector rail.
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
      {/* Routing condition at the TOP — the editable condition is the first, most obvious click target. */}
      {data.caseEditTarget ? <ConditionRow data={data} selected={data.conditionSelected} /> : null}
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
          {/* Non-case condition info stays an inline chip; a switch case's condition uses the row above. */}
          {data.caseEditTarget ? null : <BranchConditionChip data={data} />}
          <LintBadge errors={data.lintErrors} />
          <UnsavedDot show={data.unsaved} />
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
  // Leaves on the full canvas are selectable; placeholders aren't.
  const selectable = !isPlaceholder;

  const card = isPlaceholder ? <PlaceholderCard data={data} /> : <ComponentCard data={data} selectable={selectable} />;

  return (
    <div className={cn('group relative', data.appeared && APPEAR_ANIM)} ref={ref} style={{ width: FLOW_CARD_WIDTH }}>
      <NodeHandles />
      {card}
      {data.flash ? <FlashPulse token={data.flashToken} /> : null}
    </div>
  );
};

type FlowInsertData = {
  label?: string;
  payload?: FlowInsertPayload;
  /** A "ghost branch" add (e.g. Add case) reached by a dashed connector — styled as a pill. */
  ghost?: boolean;
  // Injected by the canvas (edit mode only). Absent in read-only mode → not rendered.
  onInsert?: (payload: FlowInsertPayload) => void;
};

// An "add" affordance. As a ghost branch it's a dashed pill reached by a faint connector; inline
// it's a plain "+". Edit mode only; the l/r handles let the ghost connector edge attach.
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

type LinkTone = 'primary' | 'muted' | 'error';
// Edge LABELS also support the warning-toned routing-condition tone (the line itself stays primary).
type LinkLabelTone = LinkTone | 'condition';
type FlowLinkData = {
  label?: string;
  /** Selection context: unrelated edges fade, connected ones render full strength. */
  dimmed?: boolean;
};

const HIGHLIGHT_STROKE = 'var(--color-primary)';

const LINK_STROKE: Record<LinkTone, string> = {
  primary: 'var(--color-primary)',
  muted: 'var(--color-border)',
  error: 'var(--color-destructive)',
};

// Tone-matched label styling — solid pill, tinted border, text in the edge's own colour — so tags
// read clearly against the darker nested-container backgrounds rather than as low-contrast gray.
const LINK_LABEL_STYLE: Record<LinkLabelTone, string> = {
  primary: 'border-primary/40 text-primary',
  error: 'border-destructive/40 text-destructive',
  muted: 'border-border text-foreground',
  // Routing conditions read as the warning accent, matching the legend and the cards' condition chips.
  condition: 'border-warning/40 text-warning',
};
// Edge labels render into RF's shared layer below the nodes; lift the pill above the cards so a
// label in a container's gutter isn't painted over.
const LINK_LABEL_Z = 1000;
const LinkLabel = ({
  d,
  tone,
  x,
  y,
  onClick,
}: {
  d: FlowLinkData;
  tone: LinkLabelTone;
  x: number;
  y: number;
  onClick?: () => void;
}) => {
  const className = cn(
    // Condition labels are Bloblang code: mono, not uppercased, matching the card's condition chips.
    'nodrag nopan absolute max-w-[200px] truncate rounded border bg-background px-1.5 py-0.5 font-medium font-mono text-caption-sm shadow-sm',
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

// Control-flow processors (branch/switch/try/for_each/…) have no logo or config meta. Each gets a
// glyph + one-line descriptor (count of cases / steps, or routing role) so it reads as a router,
// not an empty card.
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

// A filled accent tile for the control-flow glyph — distinct from the white connector `LogoTile`
// so a router marker never reads as a data card.
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

// A control-flow processor as a compact card. It never wraps children — in the Dagre graph its
// branches fan out as labelled edges and reconverge at a merge node. This card is the fan-out marker.
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
        {/* Routing condition at the TOP — the first, most obvious click target (like leaf cards). */}
        {data.caseEditTarget ? <ConditionRow data={data} selected={data.conditionSelected} /> : null}
        <div className="flex cursor-pointer items-center gap-2.5 px-3 py-2" style={headerTintStyle(accent)}>
          <ControlFlowIconTile accent={accent} Icon={Icon} />
          <span className="flex min-w-0 flex-1 flex-col">
            <Text
              as="span"
              className="truncate text-caption-sm uppercase leading-none tracking-wide"
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
          <UnsavedDot show={data.unsaved} />
        </div>
        {/* "Add case / Add input" as a footer row inside the card, clearly tied to the node. Edit mode only. */}
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

// The join point where a fan's branches reconverge. Fan-in edges plug into its left, flow leaves
// its right. A filled primary-tint disc (not a hollow ring) so it reads as a deliberate "join".
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
const EdgeInsertButton = ({
  x,
  y,
  onInsert,
  zIndex,
}: {
  x: number;
  y: number;
  onInsert: () => void;
  zIndex?: number;
}) => (
  <EdgeLabelRenderer>
    <button
      aria-label="Insert a step"
      className="nodrag nopan pointer-events-auto absolute flex size-6 cursor-pointer items-center justify-center rounded-full border border-primary bg-background text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
      onClick={onInsert}
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, zIndex }}
      type="button"
    >
      <PlusIcon className="size-3.5" />
    </button>
  </EdgeLabelRenderer>
);

type FlowGraphEdgeData = {
  tone?: LinkTone;
  dashed?: boolean;
  label?: string;
  points?: { x: number; y: number }[];
  insertIndex?: number;
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

// Smooth a polyline through Dagre's node-avoiding waypoints (quadratic segments via midpoints);
// following those routed points keeps lines clear of the cards.
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

// Stroke colour under selection context: emphasized wins (except on error edges, whose red stays),
// then the faint tier, then the tone's own colour.
function edgeStroke(d: FlowGraphEdgeData | undefined, tone: LinkTone): string {
  if (d?.emphasized && tone !== 'error') {
    return HIGHLIGHT_STROKE;
  }
  if (d?.faint) {
    return 'var(--color-muted-foreground)';
  }
  return LINK_STROKE[tone];
}

// Edge opacity tiers: dimmed (unrelated to the selection) < ghost (decorative) < faint (context
// line) < full strength.
function edgeOpacity(d: FlowGraphEdgeData | undefined): number {
  if (d?.dimmed) {
    return 0.25;
  }
  if (d?.ghost) {
    return 0.4;
  }
  return d?.faint ? 0.6 : 1;
}

// Every edge in the Dagre DAG, routed through Dagre's waypoints so lines avoid nodes. Styled by
// type: solid primary for flow, red dashed for error, dashed for copy/merge and resource refs. No
// arrowheads — the left-to-right layout already reads as direction.
function FlowGraphEdge({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data }: EdgeProps) {
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
  const width = d?.emphasized ? 4 : 3;
  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: edgeStroke(d, tone),
          strokeWidth: width,
          strokeDasharray: d?.dashed ? '6 5' : undefined,
          opacity: edgeOpacity(d),
        }}
      />
      {d?.label ? (
        <LinkLabel
          d={{ label: d.label, dimmed: d.dimmed }}
          onClick={d.onLabelClick}
          // A labelled primary edge's label IS a routing condition (flow edges are unlabelled), so
          // render it in the warning tone like the condition chips, not primary-blue. Line stays primary.
          tone={tone === 'primary' ? 'condition' : tone}
          x={labelX}
          // When an on-edge "+" shares this midpoint, lift the label clear so the two don't overprint.
          y={d?.onInsert ? labelY - 18 : labelY}
        />
      ) : null}
      {d?.onInsert ? <EdgeInsertButton onInsert={d.onInsert} x={insertX} y={insertY} zIndex={1001} /> : null}
    </>
  );
}

export const flowNodeTypes = {
  flowCard: FlowCardNode,
  flowInsert: FlowInsertNode,
  flowSplit: FlowSplitNode,
  flowMerge: FlowMergeNode,
};

export const flowEdgeTypes = {
  flowGraphEdge: FlowGraphEdge,
};
