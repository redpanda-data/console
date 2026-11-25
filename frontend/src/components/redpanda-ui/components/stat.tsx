import type { VariantProps } from 'class-variance-authority';
import { ArrowDown, ArrowUp, ArrowUpRight, Minus } from 'lucide-react';
import type React from 'react';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type SharedProps } from '../lib/utils';
import { statGroupVariants, statValueVariants } from './stat/variants';

export type StatDeltaDirection = 'up' | 'down' | 'neutral';

export interface StatDelta {
  /** Drives the icon and default color. */
  direction: StatDeltaDirection;
  /** Override the semantic tone of the delta. Defaults to direction-based color. */
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'destructive';
  /** Formatted change text, e.g. "+12%" or "-3.2k". */
  value: string;
}

const deltaIcons: Record<StatDeltaDirection, React.ComponentType<{ className?: string }>> = {
  up: ArrowUp,
  down: ArrowDown,
  neutral: Minus,
};

const deltaToneByDirection: Record<StatDeltaDirection, NonNullable<StatDelta['tone']>> = {
  up: 'success',
  down: 'destructive',
  neutral: 'muted',
};

const deltaToneClasses: Record<NonNullable<StatDelta['tone']>, string> = {
  default: 'text-foreground',
  muted: 'text-subtle',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export interface StatLabelLinkProps {
  /** The label and decorative trailing arrow; render these as the link content. */
  children: React.ReactNode;
  /** Caption appearance owned by Stat; apply it to the link host. */
  className: string;
}

export interface StatProps
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    VariantProps<typeof statValueVariants>,
    SharedProps {
  delta?: StatDelta | undefined;
  /** Caption rendered above the value, uppercased and muted. */
  label: string;
  /** Render a native or framework link with the supplied caption recipe and content; the caller owns routing, refs, and events. */
  renderLabelLink?: ((props: StatLabelLinkProps) => React.ReactElement) | undefined;
  /** Secondary line rendered below the value (e.g. "6 partitions"), muted and smaller. */
  sublabel?: React.ReactNode | undefined;
  value: React.ReactNode;
}

// Mirrors `labelStrongXSmall` typography so a linked label is visually identical to a plain one.
const LABEL_LINK_CLASSNAME =
  'inline-flex items-center gap-1 font-semibold text-body-sm text-subtle uppercase transition-colors motion-reduce:transition-none link-standalone hover:text-foreground';

export const Stat = ({
  className,
  label,
  value,
  sublabel,
  size,
  tone,
  mono,
  delta,
  renderLabelLink,
  testId,
  ref,
  ...props
}: StatProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => {
  const deltaTone = delta === undefined ? undefined : (delta.tone ?? deltaToneByDirection[delta.direction]);
  const DeltaIcon = delta === undefined ? undefined : deltaIcons[delta.direction];

  const labelNode =
    renderLabelLink === undefined ? (
      <span className="text-body-sm font-semibold text-subtle uppercase" data-slot="stat-label">
        {label}
      </span>
    ) : (
      renderLabelLink({
        className: LABEL_LINK_CLASSNAME,
        children: (
          <>
            {label}
            <ArrowUpRight aria-hidden="true" className="size-3" />
          </>
        ),
      })
    );

  /**
   * Root is a 2-row grid (label + value block) so that `StatGroup` can opt each stat into
   * `grid-rows-subgrid`, aligning every value on a shared baseline across a row regardless of
   * label wrapping. Standalone (no grid parent), `grid-rows-subgrid`/`row-span` are inert and
   * this renders identically to a flex-col.
   */
  return (
    <div className={cn('grid gap-y-0.5', className)} data-slot="stat" data-testid={testId} ref={ref} {...props}>
      {labelNode}
      <div className="flex flex-col gap-0.5" data-slot="stat-value-block">
        {/*
         * Inline flow, not flex: a flex item keeps its full width when its text wraps, which stranded
         * the delta after a half-empty box in narrow cells. Inline, the value stays on one line when it
         * fits, the delta drops to the next line when it doesn't, and an over-long value wraps instead
         * of spilling into the next cell. The trailing margin spaces the delta without indenting it
         * once it has wrapped. `leading-0` keeps the wrapper's own line box (its strut) from adding
         * height, so a line is exactly as tall as the value's `leading-none`, as it was under flex.
         */}
        <div className="leading-0 wrap-break-word">
          <span
            className={cn(statValueVariants({ size, tone, mono }), delta === undefined ? delta : 'me-2')}
            data-slot="stat-value"
          >
            {value}
          </span>
          {delta !== undefined && DeltaIcon !== undefined ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-body-sm font-medium',
                deltaToneClasses[deltaTone ?? 'muted']
              )}
              data-slot="stat-delta"
            >
              <DeltaIcon className="size-3" />
              {delta.value}
            </span>
          ) : null}
        </div>
        {hasSlotContent(sublabel) ? (
          <span className="text-body-sm font-normal text-subtle" data-slot="stat-sublabel">
            {sublabel}
          </span>
        ) : null}
      </div>
    </div>
  );
};
Stat.displayName = 'Stat';

export interface StatGroupProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof statGroupVariants>,
    SharedProps {}

export const StatGroup = ({
  className,
  columns,
  gap,
  testId,
  children,
  ref,
  ...props
}: StatGroupProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  // The wrapper is the size container the column steps query; the grid keeps the slot, ref, props and
  // caller className, so existing overrides and selectors still apply to it. `w-full` keeps the
  // container from collapsing in a shrink-to-fit parent, since a size container has no width of its own.
  <div className="@container/stat-group w-full" data-slot="stat-group-container">
    <div
      className={cn(statGroupVariants({ columns, gap }), className)}
      data-slot="stat-group"
      data-testid={testId}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  </div>
);
StatGroup.displayName = 'StatGroup';
