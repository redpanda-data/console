'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  AnimatePresence,
  type HTMLMotionProps,
  MotionConfigContext,
  motion,
  type Transition,
  useReducedMotion,
} from 'motion/react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

type HighlightBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function boundsEqual(a: HighlightBounds | null, b: HighlightBounds | null): boolean {
  if (a === b) {
    return true;
  }
  if (!(a && b)) {
    return false;
  }
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

// biome-ignore lint/suspicious/noExplicitAny: compat helper must accept any Base UI render prop shape
type TabsRenderFn = any;

type TabsRenderProp = React.ReactElement | TabsRenderFn | undefined;

/**
 * Build the data-state attribute from Base UI's render-prop state so Radix-era
 * CSS selectors (`data-[state=active]:...`) keep working.
 */
function dataStateFromBaseUi(state: { active?: boolean; hidden?: boolean }): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (typeof state?.active === 'boolean') {
    attrs['data-state'] = state.active ? 'active' : 'inactive';
  } else if (typeof state?.hidden === 'boolean') {
    attrs['data-state'] = state.hidden ? 'inactive' : 'active';
  }
  return attrs;
}

/**
 * Render prop factory. When no user-supplied render is provided, render the
 * given element tag with injected `data-state`. When the user supplies a
 * render (JSX element or function), compose it with `data-state` so router
 * links / anchors keep working as Tabs triggers.
 */
function renderTabWithActiveState(Element: 'button' | 'div', userRender?: TabsRenderProp): TabsRenderFn {
  return ((props: Record<string, unknown>, state: { active?: boolean; hidden?: boolean }) => {
    const mergedProps = { ...props, ...dataStateFromBaseUi(state) };
    if (userRender == null) {
      return React.createElement(Element as string, mergedProps);
    }
    if (React.isValidElement(userRender)) {
      return React.cloneElement(userRender as React.ReactElement, mergedProps);
    }
    if (typeof userRender === 'function') {
      return (userRender as TabsRenderFn)(mergedProps, state);
    }
    return React.createElement(Element as string, mergedProps);
  }) as TabsRenderFn;
}

const tabsVariants = cva('flex flex-col', {
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

type TabsProps = Omit<React.ComponentProps<typeof TabsPrimitive.Root>, 'onValueChange'> &
  VariantProps<typeof tabsVariants> &
  SharedProps & {
    onValueChange?: (value: string) => void;
  };

function Tabs({ className, size, variant, testId, onValueChange, ...props }: TabsProps) {
  const handleValueChange = React.useCallback(
    (nextValue: unknown) => {
      onValueChange?.(nextValue as string);
    },
    [onValueChange]
  );

  return (
    <TabsPrimitive.Root
      className={cn(tabsVariants({ size, variant }), className)}
      data-slot="tabs"
      data-testid={testId}
      onValueChange={onValueChange ? handleValueChange : undefined}
      {...props}
    />
  );
}

const tabsListVariants = cva('inline-flex h-10 items-center justify-center text-muted-foreground', {
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
});

const tabsListActiveVariants = cva('rounded-sm bg-background shadow-sm', {
  variants: {
    variant: {
      default: '',
      underline:
        "rounded-none bg-transparent shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-selected after:content-['']",
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants> &
  SharedProps & {
    activeClassName?: string;
    transition?: Transition;
    columns?: number;
  };

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  (
    {
      children,
      className,
      activeClassName,
      variant,
      layout,
      gap,
      columns,
      testId,
      transition = {
        type: 'spring',
        stiffness: 200,
        damping: 25,
      },
      ...props
    },
    ref
  ) => {
    const localRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => localRef.current || document.createElement('div'));

    const [bounds, setBounds] = React.useState<HighlightBounds | null>(null);
    const [orientation, setOrientation] = React.useState<'horizontal' | 'vertical'>('horizontal');

    const syncHighlight = React.useCallback(() => {
      const list = localRef.current;
      if (!list) {
        return;
      }
      const activeTab = list.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]');
      const nextOrientation =
        (list.getAttribute('data-orientation') as 'horizontal' | 'vertical' | null) ?? 'horizontal';
      setOrientation((prev) => (prev === nextOrientation ? prev : nextOrientation));

      if (!activeTab) {
        setBounds((prev) => (prev === null ? prev : null));
        return;
      }

      const nextBounds: HighlightBounds = {
        top: activeTab.offsetTop,
        left: activeTab.offsetLeft,
        width: activeTab.offsetWidth,
        height: activeTab.offsetHeight,
      };
      setBounds((prev) => (boundsEqual(prev, nextBounds) ? prev : nextBounds));
    }, []);

    React.useLayoutEffect(() => {
      const list = localRef.current;
      if (!list) {
        return;
      }

      // Initial sync (before first paint).
      syncHighlight();

      let rafId = 0;
      const scheduleSync = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(syncHighlight);
      };

      const mutationObserver = new MutationObserver(scheduleSync);
      mutationObserver.observe(list, {
        attributes: true,
        attributeFilter: ['data-state', 'data-orientation', 'data-value'],
        childList: true,
        subtree: true,
      });

      const resizeObserver = new ResizeObserver(scheduleSync);
      resizeObserver.observe(list);
      for (const tab of list.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]')) {
        resizeObserver.observe(tab);
      }

      return () => {
        cancelAnimationFrame(rafId);
        mutationObserver.disconnect();
        resizeObserver.disconnect();
      };
    }, [syncHighlight]);

    const isHorizontal = orientation !== 'vertical';
    // Lock the perpendicular axis: when the active tab moves to a different
    // row (horizontal) or column (vertical), the highlight should snap on that
    // axis instead of animating in 2D, which looks amateur.
    const axisLockedTransition: Transition = React.useMemo(() => {
      const snap = { duration: 0 } as const;
      return isHorizontal ? { ...transition, top: snap, height: snap } : { ...transition, left: snap, width: snap };
    }, [transition, isHorizontal]);

    const showHighlight = bounds !== null;

    return (
      <TabsPrimitive.List
        className={cn(
          'relative',
          tabsListVariants({ variant, layout, gap }),
          layout === 'equal' && columns && `grid-cols-${columns}`,
          className
        )}
        data-slot="tabs-list"
        data-testid={testId}
        ref={localRef}
        {...props}
      >
        <AnimatePresence initial={false}>
          {showHighlight ? (
            <motion.div
              animate={{
                top: bounds.top,
                left: bounds.left,
                width: bounds.width,
                height: bounds.height,
                opacity: 1,
              }}
              aria-hidden
              className={cn('pointer-events-none absolute z-0', tabsListActiveVariants({ variant }), activeClassName)}
              data-slot="tabs-list-highlight"
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              initial={false}
              transition={axisLockedTransition}
            />
          ) : null}
        </AnimatePresence>
        {children}
      </TabsPrimitive.List>
    );
  }
);

TabsList.displayName = 'TabsList';

const tabsTriggerVariants = cva(
  'z-[1] inline-flex size-full cursor-pointer items-center justify-center whitespace-nowrap rounded-sm font-medium text-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground',
  {
    variants: {
      variant: {
        default: 'px-3 py-1.5',
        underline: 'px-4 py-2 text-muted-foreground data-[state=active]:text-selected',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TabsTriggerProps = Omit<React.ComponentProps<typeof TabsPrimitive.Tab>, 'render'> &
  SharedProps & {
    variant?: VariantProps<typeof tabsTriggerVariants>['variant'];
    /**
     * Base UI render prop. Pass a JSX element (e.g. a router `<Link />`) or a
     * function to swap the rendered element while keeping Tab keyboard and
     * active-state behavior. Defaults to a native `<button>`.
     */
    render?: TabsRenderProp;
  };

function TabsTrigger({ className, value, variant, testId, disabled, render, ...props }: TabsTriggerProps) {
  // If the consumer's render is a non-button intrinsic (e.g. `<a href>` for
  // link-style tabs), tell Base UI to polyfill button semantics instead of
  // asserting a native button. Function-form renders and component children
  // are assumed to render a <button>; consumers can pass nativeButton={false}
  // explicitly otherwise.
  const nativeButton =
    React.isValidElement(render) && typeof render.type === 'string' && render.type !== 'button' ? false : undefined;

  return (
    <TabsPrimitive.Tab
      className={cn(tabsTriggerVariants({ variant }), className)}
      data-slot="tabs-trigger"
      data-testid={testId}
      data-value={value}
      disabled={disabled}
      nativeButton={nativeButton}
      render={renderTabWithActiveState('button', render)}
      value={value}
      {...props}
    />
  );
}

type TabsContentProps = React.ComponentProps<typeof TabsPrimitive.Panel> &
  HTMLMotionProps<'div'> &
  SharedProps & {
    transition?: Transition;
  };

function TabsContent({
  className,
  children,
  transition = {
    duration: 0.5,
    ease: 'easeInOut',
  },
  testId,
  ...props
}: TabsContentProps) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotionConfig = React.useContext(MotionConfigContext).reducedMotion;
  const shouldReduceMotion = reducedMotionConfig === 'always' || prefersReducedMotion;

  return (
    <TabsPrimitive.Panel
      render={
        <motion.div
          className={cn('flex-1 space-y-6 outline-none', className)}
          data-slot="tabs-content"
          data-testid={testId}
          {...(shouldReduceMotion
            ? {
                initial: false,
                layout: false,
              }
            : {
                animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
                exit: { opacity: 0, y: 10, filter: 'blur(4px)' },
                initial: { opacity: 0, y: -10, filter: 'blur(4px)' },
                layout: true,
                transition,
              })}
        >
          {children}
        </motion.div>
      }
      {...props}
    />
  );
}

type TabsContentsProps = HTMLMotionProps<'div'> & {
  children: React.ReactNode;
  className?: string;
  transition?: Transition;
};

function TabsContents({
  children,
  className,
  transition = { type: 'spring', stiffness: 200, damping: 25 },
  ...props
}: TabsContentsProps) {
  return (
    <motion.div
      className={cn('overflow-visible', className)}
      data-slot="tabs-contents"
      layout
      style={{ height: 'auto' }}
      transition={transition}
      {...props}
    >
      {children}
    </motion.div>
  );
}

const tabsContentWrapperVariants = cva('', {
  variants: {
    variant: {
      default: '',
      card: 'p-6',
      contained: 'mx-1 -mt-2 mb-1 h-full rounded-sm bg-background p-6',
    },
    spacing: {
      none: '',
      sm: 'space-y-3',
      md: 'space-y-4',
      lg: 'space-y-6',
    },
  },
  defaultVariants: {
    variant: 'default',
    spacing: 'md',
  },
});

interface TabsContentWrapperProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof tabsContentWrapperVariants> {}

function TabsContentWrapper({ className, variant, spacing, ...props }: TabsContentWrapperProps) {
  return <div className={cn(tabsContentWrapperVariants({ variant, spacing }), className)} {...props} />;
}

const tabsFieldVariants = cva('flex flex-col', {
  variants: {
    spacing: {
      tight: 'space-y-1',
      normal: 'space-y-1.5',
      loose: 'space-y-2',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

interface TabsFieldProps extends React.ComponentProps<'div'>, VariantProps<typeof tabsFieldVariants> {}

function TabsField({ className, spacing, ...props }: TabsFieldProps) {
  return <div className={cn(tabsFieldVariants({ spacing }), className)} {...props} />;
}

const tabsSectionVariants = cva('space-y-4', {
  variants: {
    spacing: {
      none: 'space-y-0',
      sm: 'space-y-2',
      md: 'space-y-3',
      lg: 'space-y-4',
      xl: 'space-y-6',
    },
  },
  defaultVariants: {
    spacing: 'lg',
  },
});

interface TabsSectionProps extends React.ComponentProps<'div'>, VariantProps<typeof tabsSectionVariants> {}

function TabsSection({ className, spacing, ...props }: TabsSectionProps) {
  return <div className={cn(tabsSectionVariants({ spacing }), className)} {...props} />;
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsContents,
  TabsContentWrapper,
  TabsField,
  TabsSection,
  type TabsProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentProps,
  type TabsContentsProps,
};