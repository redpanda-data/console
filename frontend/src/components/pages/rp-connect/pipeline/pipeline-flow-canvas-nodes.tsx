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
import { AlertCircle, Box, ChevronDown, ChevronRight, PlusIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { ConnectorLogo } from '../onboarding/connector-logo';
import type { NodeMetaEntry } from '../utils/pipeline-flow-meta';
import {
  FLOW_CARD_WIDTH,
  FLOW_COMPACT_CARD_WIDTH,
  FLOW_SPINE_HANDLE_LEFT,
  FLOW_SPINE_HANDLE_TOP,
} from '../utils/pipeline-flow-parser';
import type { EditTarget } from '../utils/yaml';

const invisibleHandle = '!w-1.5 !h-1.5 !border-0 !bg-transparent !min-w-0 !min-h-0';
// A node revealed this render (e.g. by expanding its container) fades + grows in.
// Applied to the card body (never the React Flow node wrapper, whose `transform`
// drives positioning and would fight a scale/translate enter animation).
const APPEAR_ANIM = 'fade-in zoom-in-95 animate-in duration-200';
// Anchor the spine (left/right) handles a fixed distance below the card top —
// roughly the title row — so cards of differing heights connect along a
// horizontal line. The top/bottom handles are anchored a fixed distance from the
// left so vertically-stacked cards of differing widths connect along a straight
// vertical line (no diagonal connectors).
const SPINE_HANDLE_TOP = FLOW_SPINE_HANDLE_TOP;
const SPINE_HANDLE_LEFT = FLOW_SPINE_HANDLE_LEFT;

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
export const SECTION_ACCENT: Record<string, string> = {
  input: 'var(--color-green-500)',
  processor: 'var(--color-blue-500)',
  output: 'var(--color-purple-500)',
  resource: 'var(--color-orange-500)',
};

export function sectionAccent(section?: string): string | undefined {
  return section ? SECTION_ACCENT[section] : undefined;
}

// The role accent shown as a solid bar down a card's left edge. Cards keep their
// neutral border; only the left side takes the role colour, so the role reads at a
// glance without recolouring the whole card.
function accentBarStyle(accent?: string): React.CSSProperties | undefined {
  return accent ? { borderLeftStyle: 'solid', borderLeftWidth: 3, borderLeftColor: accent } : undefined;
}

// A faint wash of the role colour behind the connector logo, so the icon sits in a
// small tinted chip that echoes the accent bar.
function accentChipStyle(accent?: string): React.CSSProperties | undefined {
  return accent ? { backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` } : undefined;
}

// The connector logo in a small rounded chip tinted with the role accent.
const LogoChip = ({ name, accent, compact }: { name: string; accent?: string; compact?: boolean }) => (
  <span
    className={cn('flex shrink-0 items-center justify-center rounded-md', compact ? 'size-6' : 'size-7')}
    style={accentChipStyle(accent)}
  >
    <ConnectorLogo className={compact ? 'size-4' : 'size-5'} fallback={Box} name={name as ComponentName} />
  </span>
);

// The routing semantics of a node, shown as a chip on its card: `if <check>` for a
// condition, `default` for the catch-all, `on error` for error handlers (catch) —
// red for any error / dead-letter route.
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
  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-center rounded border px-1.5 py-0.5 font-medium text-[10px] leading-none',
        tone === 'error' && 'border-destructive/40 bg-destructive/5 text-destructive',
        tone === 'muted' && 'border-border bg-muted/50 text-muted-foreground',
        tone === 'condition' && 'border-blue-500/40 bg-blue-500/5 text-blue-600',
        className
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
  /** Y (px) anchors of the container routing ports: `gs` (entry/copy/fan-out)
      and `gt` (merge/fan-in). Level with a child's connector row for sequential
      flows, the children-area centre for fans. */
  portOutY?: number;
  portInY?: number;
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
  editTarget?: EditTarget;
  /** Highlighted because it's the node selected in the inspector. */
  selected?: boolean;
  /** Briefly pulse this node (e.g. after an undo/redo touched it). */
  flash?: boolean;
  /** Changes on each flash so the pulse animation replays. */
  flashToken?: number;
  /** Newly added this render (e.g. revealed by expanding a container) — fades and
      grows in place rather than sliding from the canvas origin. */
  appeared?: boolean;
  /** Lint messages from the server that map to this node's config. */
  lintErrors?: string[];
  // Injected by the canvas (edit mode only).
  onToggle?: () => void;
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
    {HANDLE_IDS.map((h) => {
      const horizontal = h.id === 'l' || h.id === 'r';
      // Pin the handle to a fixed offset and clear React Flow's default centering
      // transform. Without this, overriding only `left`/`top` leaves the default
      // `translate(-50%, …)` in place, so the spine handle's coordinate shifts with
      // the node's size and the connecting line angles between cards of different
      // widths. `transform: none` makes the offset absolute and identical for all.
      const style = horizontal
        ? { top: SPINE_HANDLE_TOP, transform: 'none' }
        : { left: SPINE_HANDLE_LEFT, transform: 'none' };
      return (
        <Handle className={invisibleHandle} id={h.id} key={h.id} position={h.position} style={style} type={h.type} />
      );
    })}
  </>
);

// Internal ports on a container so flow visibly threads through it: `gs` emits the
// entry / copy / fan-out edges into the children; `gt` receives the merge-back /
// fan-in edges. The layout computes their exact y so sequential entry/copy/merge
// lines run level with the first/last child's connector row (clear of the header
// and its icon) and fan trunks anchor at the children-area centre.
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

// Kafka/Redpanda topics rendered as scannable chips — the single most useful fact
// for a source or sink. Capped so a long topic list doesn't blow out the card.
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

const MetaRows = ({ data }: { data: FlowCardData }) => {
  const hasContent = data.meta?.length || data.topics?.length || data.missingTopic || data.missingSasl;
  if (!hasContent) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5 border-border/60 border-t px-3 py-2">
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

// A compact sidebar card: logo + name, with the label (e.g. a resource's label)
// on its own row beneath so neither it nor the name gets truncated against the other.
const CompactCard = ({ data }: { data: FlowCardData }) => {
  const accent = sectionAccent(data.section);
  return (
    <div
      className="group flex flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 shadow-sm transition-shadow hover:shadow-md"
      style={accent ? { borderLeftStyle: 'solid', borderLeftWidth: 2, borderLeftColor: accent } : undefined}
    >
      <div className="flex items-center gap-2">
        <ConnectorLogo className="size-4 shrink-0" fallback={Box} name={data.label as ComponentName} />
        <Text as="span" className="min-w-0 flex-1 truncate font-medium text-sm" title={data.label}>
          {data.label}
        </Text>
      </div>
      {data.labelText ? <LabelBadge className="max-w-full self-start" label={data.labelText} /> : null}
    </div>
  );
};

// The selection ring shown on the node the inspector is editing. Uses `primary`
// (the conventional "selected" colour); the selected node still reads clearly
// because its wiring is emphasized while every unrelated edge dims.
const SELECTED_RING = 'ring-2 ring-primary ring-offset-1 ring-offset-background';
// An error ring for nodes with lint problems (takes precedence over selection).
const ERROR_RING = 'ring-2 ring-destructive ring-offset-1 ring-offset-background';

function cardRing(data: FlowCardData): string {
  if (data.lintErrors?.length) {
    return ERROR_RING;
  }
  return data.selected ? SELECTED_RING : '';
}

// A brief double-pulse ring overlay drawn on a node after an undo/redo touched it.
// Uses the Redpanda `brand` (orange-red) token — a transient "this just changed"
// highlight, distinct from selection (primary) and errors (destructive). Keyed by
// `token` so re-flashing the same node replays the animation.
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

// A small red chip showing the count of lint problems on a node; the messages are
// the native tooltip (and shown in full in the inspector).
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

// A leaf component card. The whole card is the click target (selection is handled
// by React Flow's onNodeClick); editing happens in the inspector rail.
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
      style={accentBarStyle(accent)}
    >
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-0.5">
        <Text
          as="span"
          className="shrink-0 uppercase tracking-wide"
          style={accent ? { color: accent } : undefined}
          variant="captionStrongMedium"
        >
          {kindLabel}
        </Text>
        <BranchConditionChip data={data} />
        <LintBadge errors={data.lintErrors} />
      </div>
      <div className="flex w-full items-center gap-2 px-3 pb-2 text-left">
        <LogoChip accent={accent} name={data.label} />
        <Text as="span" className="min-w-0 flex-1 truncate font-semibold" title={data.label} variant="bodyStrongMedium">
          {data.label}
        </Text>
      </div>
      {data.labelText ? (
        <div className="px-3 pb-2">
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
  // Leaves on the full canvas are selectable; placeholders and the compact sidebar are not.
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

// The logo + (kind / name) of a container's title bar — compact shows one row, full
// stacks the colored kind label above the name.
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
    // flex-1 + a minimum width: the title claims leftover space and never gets
    // crushed to a sliver by a long condition chip (the chip truncates instead).
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

// A switch case's title: a "CASE N" eyebrow above its routing condition, which
// gets a full-width line (mono) instead of a cramped chip. Cases are structural
// (no connector logo) — this also signals they aren't editable components.
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

// The leading content of a container header: a switch case shows its condition
// front-and-centre (no connector logo); every other container shows logo + kind /
// name + label + condition chip.
const ContainerHeaderTitle = ({ data, accent }: { data: FlowCardData; accent?: string }) => {
  if (data.isCase) {
    return <CaseTitle data={data} />;
  }
  return (
    <>
      <LogoChip accent={accent} compact={data.compact} name={data.label} />
      <ContainerTitleText accent={accent} data={data} />
      <LabelBadge className="max-w-[35%]" label={data.labelText} />
      <BranchConditionChip className="max-w-[45%]" data={data} />
    </>
  );
};

// A container processor (branch/switch/parallel/…) or multi-input broker: a titled
// box that visually encloses its children. React Flow renders the child nodes
// inside the body; this component only draws the chrome (title bar + border).
const FlowContainerNode = ({ data }: { data: FlowCardData }) => {
  const ref = useStopPanOnControls();
  const accent = SECTION_ACCENT[data.section ?? ''];
  // The full-canvas container header is the click target for selection; the compact
  // sidebar isn't selectable.
  const selectable = !data.compact;

  return (
    // The handles live on this border-less wrapper so their `left`/`top` offsets are
    // measured from the node's outer edge — identical to leaf cards. (Putting them on
    // the bordered box below would shift them by the border/accent width and angle the
    // spine between cards and containers.)
    <div className={cn('group relative h-full w-full', data.appeared && APPEAR_ANIM)} ref={ref}>
      <ContainerHandles gsTop={data.portOutY} gtTop={data.portInY} />
      {data.flash ? <FlashPulse token={data.flashToken} /> : null}
      <div
        className={cn(
          'flex h-full w-full flex-col rounded-lg border border-border border-dashed bg-muted/20 shadow-sm',
          cardRing(data)
        )}
        style={accentBarStyle(accent)}
      >
        <div
          className={cn(
            'flex items-center gap-2 bg-card/80',
            selectable && 'cursor-pointer',
            data.compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
            // Collapsed: the header is the whole card, so fill + centre it (no divider)
            // so the spine arrows align with its middle. Expanded: header on top.
            data.collapsed ? 'h-full rounded-lg' : 'rounded-t-lg border-border/60 border-b'
          )}
        >
          <ContainerHeaderTitle accent={accent} data={data} />
          <LintBadge errors={data.lintErrors} />
          {/* Collapse toggle is a separate control so it doesn't also select the node.
              Generous hit area (28px) so collapsing/expanding is easy to target. */}
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

export function FlowSpineEdge({ sourceX, sourceY, targetX, targetY, markerEnd, data }: EdgeProps) {
  // The spine runs along a single row, so a straight line reads cleanest.
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const d = data as { onInsert?: () => void; dimmed?: boolean; emphasized?: boolean } | undefined;
  const onInsert = d?.onInsert;
  return (
    <>
      <BaseEdge
        markerEnd={markerEnd}
        path={path}
        style={{
          stroke: 'var(--color-primary)',
          strokeWidth: d?.emphasized ? 2.5 : 1.5,
          opacity: d?.dimmed ? 0.25 : 1,
        }}
      />
      {/* Marching dots over the solid spine show which way data flows; quieted on
          idle edges and dropped entirely on edges unrelated to the selection. */}
      {d?.dimmed ? null : (
        <path
          className="pipeline-flow-dash"
          d={path}
          fill="none"
          stroke="var(--color-primary)"
          strokeDasharray="1 9"
          strokeLinecap="round"
          strokeWidth={d?.emphasized ? 3 : 2}
          style={{ opacity: d?.emphasized ? 0.85 : 0.5, pointerEvents: 'none' }}
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
  /** Orthogonal cable route (reference edges): drop → channel beside the column →
      down the channel → along the bus below the flow → into the resource. */
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

// The cable route for a reference edge: a short drop out of the node, across to the
// clear channel beside its top-level column, down the channel, along the bus below
// the flow, then into the resource — never crossing the cards around or below it.
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

// The line colour for an edge's current state: highlighted (selection/hover) edges
// render in `primary` to match the selection ring — except error edges, whose red
// semantics win. Idle reference edges use the darker muted-foreground for legibility.
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

// Stroke styling from edge data. Idle edges are kept light; an emphasized
// (selected/hovered) edge jumps to a clearly heavier weight so it stands out.
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

// The container-side endpoint of an entry/copy/merge/fan edge, drawn as a small
// socket so the line visibly plugs into the container instead of trailing off it.
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
  const d = data as FlowLinkData | undefined;
  const tone = d?.tone ?? 'muted';
  // Place the vertical bend in this edge's own lane so fanned siblings don't share
  // (and overlap on) a single trunk.
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
    // Smaller than the tightest fan lane (14px) so a lane close to the port can't
    // force the default 20px approach stub to jog the line left then back right.
    offset: 8,
    ...(centerX === undefined ? {} : { centerX }),
  });
  // Reference cables follow an explicit orthogonal route (channel + bus); everything
  // else is a smooth step.
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

// Tone-matched label styling so copy/merge/error tags read clearly against the
// stacked (and progressively darker) nested-container backgrounds: a solid pill,
// a tinted border, and text in the edge's own colour rather than low-contrast gray.
const LINK_LABEL_STYLE: Record<LinkTone, string> = {
  primary: 'border-primary/40 text-primary',
  error: 'border-destructive/40 text-destructive',
  muted: 'border-border text-foreground',
};
const LinkLabel = ({ d, tone, x, y }: { d: FlowLinkData; tone: LinkTone; x: number; y: number }) => (
  <EdgeLabelRenderer>
    <div
      className={cn(
        'nodrag nopan absolute max-w-[170px] truncate rounded border bg-background px-1.5 py-0.5 font-semibold text-[10px] uppercase tracking-wide shadow-sm',
        LINK_LABEL_STYLE[tone]
      )}
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, opacity: d.dimmed ? 0.25 : 1 }}
      title={d.label}
    >
      {d.label}
    </div>
  </EdgeLabelRenderer>
);

export const flowNodeTypes = {
  flowCard: FlowCardNode,
  flowContainer: FlowContainerNode,
  flowSectionLabel: FlowSectionLabel,
};

export const flowEdgeTypes = {
  flowSpine: FlowSpineEdge,
  flowLink: FlowLinkEdge,
};
