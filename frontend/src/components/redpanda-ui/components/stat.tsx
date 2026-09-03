import { cva, type VariantProps } from 'class-variance-authority';
import { ArrowDown, ArrowUp, ArrowUpRight, Minus } from 'lucide-react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

export const statValueVariants = cva('leading-none', {
  variants: {
    size: {
      sm: 'text-body',
      md: 'text-body-lg',
      lg: 'font-bold text-2xl tracking-tighter',
    },
    tone: {
      default: 'text-foreground',
      muted: 'text-subtle',
      informative: 'text-informative',
      success: 'text-success',
      warning: 'text-warning',
      destructive: 'text-destructive',
    },
    mono: {
      true: 'font-mono tabular-nums',
      false: '',
    },
  },
  defaultVariants: {
    size: 'md',
    tone: 'default',
    mono: false,
  },
});

export type StatDeltaDirection = 'up' | 'down' | 'neutral';

export interface StatDelta {
  /** Formatted change text, e.g. "+12%" or "-3.2k". */
  value: string;
  /** Drives the icon and default color. */
  direction: StatDeltaDirection;
  /** Override the semantic tone of the delta. Defaults to direction-based color. */
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'destructive';
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

export interface StatProps
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    VariantProps<typeof statValueVariants>,
    SharedProps {
  /** Caption rendered above the value, uppercased and muted. */
  label: string;
  value: React.ReactNode;
  /** Secondary line rendered below the value (e.g. "6 partitions"), muted and smaller. */
  sublabel?: React.ReactNode;
  delta?: StatDelta;
  /** Turns the label into a link. Pass a single link element with no children — label text and trailing arrow are injected and link styling merged in. */
  labelLink?: React.ReactElement<{ className?: string }>;
}

// Mirrors `labelStrongXSmall` typography so a linked label is visually identical to a plain one.
const LABEL_LINK_CLASSNAME =
  'inline-flex items-center gap-1 font-semibold text-body-sm text-subtle uppercase transition-colors motion-reduce:transition-none link-standalone hover:text-foreground';

export const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  ({ className, label, value, sublabel, size, tone, mono, delta, labelLink, testId, ...props }, ref) => {
    const deltaTone = delta ? (delta.tone ?? deltaToneByDirection[delta.direction]) : undefined;
    const DeltaIcon = delta ? deltaIcons[delta.direction] : undefined;

    const labelNode = labelLink ? (
      React.cloneElement(
        labelLink,
        { className: cn(LABEL_LINK_CLASSNAME, labelLink.props.className) },
        <>
          {label}
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </>
      )
    ) : (
      <span className="font-semibold text-body-sm text-subtle uppercase" data-slot="stat-label">
        {label}
      </span>
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
          <div className="flex items-baseline gap-2">
            <span className={cn(statValueVariants({ size, tone, mono }))} data-slot="stat-value">
              {value}
            </span>
            {delta && DeltaIcon ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium text-body-sm',
                  deltaToneClasses[deltaTone ?? 'muted']
                )}
                data-slot="stat-delta"
              >
                <DeltaIcon className="size-3" />
                {delta.value}
              </span>
            ) : null}
          </div>
          {sublabel ? (
            <span className="font-normal text-body-sm text-subtle" data-slot="stat-sublabel">
              {sublabel}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
);
Stat.displayName = 'Stat';

/**
 * Base establishes CSS subgrid row tracks and opts every child `[data-slot=stat]` into
 * `grid-rows-subgrid` spanning two rows. All labels in a row share one track height and all
 * values align, independent of label wrapping; `gap-y-0.5` keeps the label→value gap tight
 * regardless of the group's inter-cell `gap`.
 */
export const statGroupVariants = cva(
  'grid [&>[data-slot=stat]]:row-span-2 [&>[data-slot=stat]]:grid [&>[data-slot=stat]]:grid-rows-subgrid [&>[data-slot=stat]]:gap-y-0.5',
  {
    variants: {
      columns: {
        2: 'grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-3',
        4: 'grid-cols-2 md:grid-cols-4',
        6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
      },
      gap: {
        sm: 'gap-3',
        md: 'gap-4',
        lg: 'gap-6',
      },
    },
    defaultVariants: {
      columns: 4,
      gap: 'md',
    },
  }
);

export interface StatGroupProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof statGroupVariants>,
    SharedProps {}

export const StatGroup = React.forwardRef<HTMLDivElement, StatGroupProps>(
  ({ className, columns, gap, testId, children, ...props }, ref) => (
    <div
      className={cn(statGroupVariants({ columns, gap }), className)}
      data-slot="stat-group"
      data-testid={testId}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  )
);
StatGroup.displayName = 'StatGroup';
