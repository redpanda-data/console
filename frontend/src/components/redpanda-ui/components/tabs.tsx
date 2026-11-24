'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { DragScrollArea } from './drag-scroll-area';
import { cn, type SharedProps } from '../lib/utils';

const tabsVariants = cva('flex data-[orientation=horizontal]:flex-col', {
  variants: {
    size: {
      sm: 'gap-1',
      md: 'gap-2',
      lg: 'gap-3',
      xl: 'gap-4',
      full: 'w-full gap-2',
    },
    /** Wraps the strip *and* its panels, so it fills its container. `TabsList` styles the trigger. */
    variant: {
      default: '',
      card: 'rounded-xl border bg-card',
      // The root *is* the container, so the list drops its own fill — two layers hide the container
      // this variant draws. Any descendant, not just a child: `ScrollableTabsList` nests it deeper.
      contained: 'rounded-lg bg-surface-subtle [&_[data-slot=tabs-list]]:bg-transparent',
    },
  },
  defaultVariants: {
    size: 'md',
    variant: 'default',
  },
});

type TabsProps = TabsPrimitive.Root.Props & VariantProps<typeof tabsVariants> & SharedProps;

function Tabs({ className, size, variant, testId, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      className={cn(tabsVariants({ size, variant }), className)}
      data-slot="tabs"
      data-testid={testId}
      {...props}
    />
  );
}

/**
 * `variant` owns the chrome — fill, border, indicator; `layout` owns how the triggers divide the
 * strip. Separating them is what makes the variants behave alike: at the default `layout`, every one
 * sizes its triggers to their labels and packs them from the start edge. `underline` spans its
 * container regardless, because a baseline stopping short of the panel it heads is chrome, not layout.
 */
const tabsListVariants = cva(
  'inline-flex h-10 items-center justify-center text-subtle data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col',
  {
    variants: {
      variant: {
        default: 'w-fit gap-1 rounded-lg bg-surface-subtle p-1',
        // No fill: this variant's chrome is the baseline, so its own ground only slabs over the
        // surface the strip sits on.
        underline: 'relative w-full justify-start rounded-t-xl border-b !border-border py-0 text-current',
        // A section list beside the content it switches, as in a settings sidebar. No chrome of its own.
        nav: 'h-auto justify-start gap-0.5 text-current',
      },
      layout: {
        auto: '',
        equal: 'grid',
        // The triggers grow to fill, rather than each claiming the full width and happening to
        // land on an even split.
        full: 'w-full [&>[data-slot=tabs-trigger]]:flex-1',
      },
      gap: {
        none: '',
        sm: 'gap-1',
        md: 'gap-2',
        lg: 'gap-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      layout: 'auto',
      gap: 'none',
    },
  }
);

const tabsListActiveVariants = cva('rounded-sm bg-background shadow-sm', {
  variants: {
    variant: {
      default: '',
      underline:
        "rounded-none bg-transparent shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-selected after:content-[''] data-[orientation=vertical]:after:top-0 data-[orientation=vertical]:after:-right-px data-[orientation=vertical]:after:bottom-0 data-[orientation=vertical]:after:left-auto data-[orientation=vertical]:after:h-auto data-[orientation=vertical]:after:w-0.5",
      // The active row is filled, with a bar at its inline start so it follows `dir`. Side by side,
      // horizontal tabs have no leading edge to mark, so the fill alone shows the active one.
      nav: "rounded-md bg-selected-wash shadow-none before:absolute before:inset-y-2 before:inset-s-0 before:w-0.5 before:rounded-full before:bg-selected before:content-[''] data-[orientation=horizontal]:before:hidden",
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type TabsListProps = TabsPrimitive.List.Props &
  VariantProps<typeof tabsListVariants> &
  SharedProps & {
    activeClassName?: string | undefined;
    columns?: number | undefined;
  };

function TabsList({
  children,
  className,
  activeClassName,
  variant,
  layout,
  gap,
  columns,
  activateOnFocus,
  testId,
  style,
  ...props
}: TabsListProps) {
  const hasEqualColumns = layout === 'equal' && columns !== undefined && columns !== 0 && !Number.isNaN(columns);
  const gridStyle: React.CSSProperties & { '--tabs-grid-columns': string | undefined } = {
    '--tabs-grid-columns': hasEqualColumns ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
  };
  // To make an overflowing strip drag-scrollable, wrap <TabsList> in <DragScrollArea> and add
  // `w-max min-w-full` to size the list to its content. See the scrollable tabs demos.
  return (
    <TabsPrimitive.List
      activateOnFocus={activateOnFocus}
      className={cn(
        'relative',
        tabsListVariants({ variant, layout, gap }),
        className,
        hasEqualColumns && 'grid-cols-(--tabs-grid-columns)'
      )}
      data-slot="tabs-list"
      data-testid={testId}
      style={
        hasEqualColumns
          ? (state) => ({
              ...gridStyle,
              ...(typeof style === 'function' ? style(state) : style),
            })
          : style
      }
      {...props}
    >
      {/* Base UI exposes the active tab's position/size as `--active-tab-*` vars; the perpendicular axis isn't transitioned so the highlight snaps across rows/columns. */}
      <TabsPrimitive.Indicator
        aria-hidden
        className={cn(
          'pointer-events-none absolute z-0 h-(--active-tab-height) w-(--active-tab-width) duration-200 ease-out data-[orientation=horizontal]:transition-[left,width] data-[orientation=vertical]:transition-[top,height] motion-reduce:transition-none',
          'top-(--active-tab-top) left-(--active-tab-left)',
          tabsListActiveVariants({ variant }),
          activeClassName
        )}
        data-slot="tabs-list-highlight"
      />
      {children}
    </TabsPrimitive.List>
  );
}

type ScrollableTabsListProps = TabsListProps & {
  // Classes for the scroll viewport (the DragScrollArea wrapper) — `className`/`style` go to the
  // list itself, so use this to size or constrain the viewport, e.g. `scrollAreaClassName="max-w-sm"`.
  scrollAreaClassName?: string | undefined;
  // Width of the edge fade in px (forwarded to DragScrollArea).
  fadeSize?: number | undefined;
};

// Keep the bottom 4px opaque through the edge fade so the baseline border and active indicator
// (`after:-bottom-px after:h-0.5`, ~3px tall) stay crisp; still well below the label baseline.
const UNDERLINE_OPAQUE_PX = 4;

/**
 * `TabsList` pre-composed with `DragScrollArea` for overflowing strips: handles the content sizing
 * (`w-max min-w-full`) and, for `underline`, owned content padding and a crisp baseline. Drop in for
 * `TabsList` when the strip can overflow.
 */
function ScrollableTabsList({ className, scrollAreaClassName, fadeSize, variant, ...props }: ScrollableTabsListProps) {
  const underline = variant === 'underline';
  const list = <TabsList className={cn('w-max min-w-full', className)} variant={variant} {...props} />;
  return (
    <DragScrollArea
      className={scrollAreaClassName}
      fadeSize={fadeSize}
      preserveBottomEdge={underline ? UNDERLINE_OPAQUE_PX : 0}
    >
      {underline ? <div className="w-max min-w-full pb-px">{list}</div> : list}
    </DragScrollArea>
  );
}

const tabsTriggerVariants = cva(
  // Base UI uses `aria-disabled`/`data-disabled` (not native `disabled`) and `data-active`.
  // Height fills the strip, width comes from the label: a `w-full` here has every trigger claim the
  // whole list, overriding `layout` and leaving `underline`'s `justify-start` nothing to align.
  'z-[1] inline-flex h-full cursor-pointer items-center justify-center rounded-sm text-body font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active]:text-foreground data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start motion-reduce:transition-none',
  {
    variants: {
      variant: {
        // A trigger is transparent, so it tints in: an ink-only step between two greys is ~1.47 and
        // reads as nothing. Scoped off the active tab, which its indicator already marks.
        default: 'px-3 py-1.5 hover:not-data-[active]:bg-accent hover:not-data-[active]:text-accent-foreground',
        underline:
          'px-4 py-2 text-subtle hover:not-data-[active]:bg-accent hover:not-data-[active]:text-accent-foreground focus-visible:ring-inset data-[active]:text-selected',
        // Rows that tint on hover; the active one takes the selection colour. The weight stays put, so
        // activating a row never changes its width, and the ring is inset because rows meet the
        // list's edges, where a scrolling sidebar would clip an outer one.
        nav: 'rounded-md px-3 py-2 font-normal text-subtle hover:not-data-[active]:bg-accent hover:not-data-[active]:text-accent-foreground focus-visible:ring-inset data-[active]:text-selected',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TabsTriggerProps = TabsPrimitive.Tab.Props &
  SharedProps & {
    variant?: VariantProps<typeof tabsTriggerVariants>['variant'] | undefined;
  };

function TabsTrigger({ className, value: unsafeValue, variant, testId, render, ...props }: TabsTriggerProps) {
  const value: unknown = unsafeValue;
  // For a non-button render (e.g. `<a href>` link tabs), tell Base UI to polyfill button semantics instead of asserting a native button.
  const isNonButtonElement = typeof render === 'object' && 'type' in render;
  const nativeButton =
    isNonButtonElement && typeof render.type === 'string' && render.type !== 'button' ? false : undefined;

  return (
    <TabsPrimitive.Tab
      className={cn(tabsTriggerVariants({ variant }), className)}
      data-slot="tabs-trigger"
      data-testid={testId}
      data-value={value}
      nativeButton={nativeButton}
      render={render}
      value={value}
      {...props}
    />
  );
}

type TabsContentProps = TabsPrimitive.Panel.Props & SharedProps;

function TabsContent({ className, children, testId, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Panel
      className={cn('flex-1 space-y-6 outline-none data-ending-style:hidden', className)}
      data-slot="tabs-content"
      data-testid={testId}
      {...props}
    >
      {children}
    </TabsPrimitive.Panel>
  );
}

type TabsContentsProps = React.ComponentProps<'div'>;

function TabsContents({ children, className, ...props }: TabsContentsProps) {
  return (
    <div className={cn('overflow-visible', className)} data-slot="tabs-contents" {...props}>
      {children}
    </div>
  );
}

export {
  ScrollableTabsList,
  type ScrollableTabsListProps,
  Tabs,
  TabsContent,
  type TabsContentProps,
  TabsContents,
  type TabsContentsProps,
  TabsList,
  type TabsListProps,
  type TabsProps,
  TabsTrigger,
  type TabsTriggerProps,
};
