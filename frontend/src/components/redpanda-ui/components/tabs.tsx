'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

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
    variant: {
      default: '',
      card: 'rounded-xl border bg-card',
      contained: 'rounded-lg bg-muted',
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

const tabsListVariants = cva(
  'inline-flex h-10 items-center justify-center text-muted-foreground data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col',
  {
    variants: {
      variant: {
        default: 'w-fit gap-1 rounded-lg bg-muted p-1',
        underline: '!border-border relative w-full justify-start rounded-t-xl border-b bg-background py-0 text-current',
      },
      layout: {
        auto: '',
        equal: 'grid',
        full: 'w-full',
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
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

// Drag past this many px counts as a scroll (and cancels the trailing tab-activating click).
const TAB_SCROLL_DRAG_THRESHOLD = 4;

// Tracks hidden content left/right of the scroller, to fade only edges with more to reveal.
function useTabScrollEdges(ref: React.RefObject<HTMLDivElement | null>) {
  const [edges, setEdges] = React.useState({ left: false, right: false });
  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, [ref]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild);
    }
    return () => observer.disconnect();
  }, [ref, update]);
  return { edges, update };
}

// Click-and-drag horizontal scrolling for trackpad-less pointers; a real drag swallows the
// trailing click so releasing on a tab doesn't activate it.
function useTabDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
  const drag = React.useRef<{ x: number; left: number } | null>(null);
  const dragged = React.useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.button !== 0) {
      return;
    }
    drag.current = { x: e.clientX, left: el.scrollLeft };
    dragged.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const start = drag.current;
    if (!(el && start)) {
      return;
    }
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > TAB_SCROLL_DRAG_THRESHOLD) {
      dragged.current = true;
      if (typeof el.setPointerCapture === 'function' && !el.hasPointerCapture(e.pointerId)) {
        el.setPointerCapture(e.pointerId);
      }
    }
    el.scrollLeft = start.left - dx;
  };
  const onPointerEnd = () => {
    drag.current = null;
  };
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragged.current) {
      e.preventDefault();
      e.stopPropagation();
      dragged.current = false;
    }
  };
  return { onPointerDown, onPointerMove, onPointerEnd, onClickCapture };
}

type TabsListProps = TabsPrimitive.List.Props &
  VariantProps<typeof tabsListVariants> &
  SharedProps & {
    activeClassName?: string;
    columns?: number;
    // Make an overflowing horizontal tab strip drag-scrollable, with edge-fade affordances.
    scrollable?: boolean;
  };

function TabsList({
  children,
  className,
  activeClassName,
  variant,
  layout,
  gap,
  columns,
  scrollable,
  testId,
  style,
  ...props
}: TabsListProps) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const { edges, update } = useTabScrollEdges(scrollerRef);
  const drag = useTabDragScroll(scrollerRef);

  const list = (
    <TabsPrimitive.List
      className={cn(
        'relative',
        tabsListVariants({ variant, layout, gap }),
        // Size to content so it can overflow; min-w-full keeps the underline spanning the frame.
        scrollable && 'w-max min-w-full',
        className
      )}
      data-slot="tabs-list"
      data-testid={testId}
      style={
        layout === 'equal' && columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, ...style } : style
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

  if (!scrollable) {
    return list;
  }

  return (
    <div className="relative min-w-0" data-slot="tabs-list-scroll-area">
      {/* pb-px so the scroll clip doesn't cut the active underline's overhang. */}
      <div
        className="cursor-grab overflow-x-auto overscroll-x-contain pb-px [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
        onClickCapture={drag.onClickCapture}
        onPointerDown={drag.onPointerDown}
        onPointerLeave={drag.onPointerEnd}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerEnd}
        onScroll={update}
        ref={scrollerRef}
      >
        {list}
      </div>
      {/* Above the triggers so the fade covers the tab text, not just the underline. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent transition-opacity duration-200',
          edges.left ? 'opacity-100' : 'opacity-0'
        )}
        data-slot="tabs-list-fade-left"
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent transition-opacity duration-200',
          edges.right ? 'opacity-100' : 'opacity-0'
        )}
        data-slot="tabs-list-fade-right"
      />
    </div>
  );
}

const tabsTriggerVariants = cva(
  // Base UI uses `aria-disabled`/`data-disabled` (not native `disabled`) and `data-active`, so target those.
  'z-[1] inline-flex size-full cursor-pointer items-center justify-center whitespace-nowrap rounded-sm font-medium text-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-[active]:text-foreground',
  {
    variants: {
      variant: {
        default: 'px-3 py-1.5 hover:text-foreground dark:hover:text-foreground',
        underline: 'px-4 py-2 text-muted-foreground data-[active]:text-selected',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TabsTriggerProps = TabsPrimitive.Tab.Props &
  SharedProps & {
    variant?: VariantProps<typeof tabsTriggerVariants>['variant'];
  };

function TabsTrigger({ className, value, variant, testId, render, ...props }: TabsTriggerProps) {
  // For a non-button render (e.g. `<a href>` link tabs), tell Base UI to polyfill button semantics instead of asserting a native button.
  const isNonButtonElement = typeof render === 'object' && render !== null && 'type' in render;
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
      className={cn('flex-1 space-y-6 outline-none', className)}
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsContents,
  type TabsProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentProps,
  type TabsContentsProps,
};
