'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import React from 'react';

import { MotionHighlight, MotionHighlightItem } from './motion-highlight';
import { cn, type SharedProps } from '../lib/utils';

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

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> & VariantProps<typeof tabsVariants> & SharedProps;

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

const tabsListVariants = cva('inline-flex h-10 items-center justify-center text-muted-foreground', {
  variants: {
    variant: {
      default: 'w-fit gap-1 rounded-lg bg-muted p-1',
      underline:
        'relative w-full justify-start rounded-t-xl border-border border-b bg-background px-4 py-0 text-current',
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

    const [activeValue, setActiveValue] = React.useState<string | undefined>(undefined);
    const lastKnownActiveValue = React.useRef<string | undefined>(undefined);

    const getActiveValue = React.useCallback(() => {
      if (!localRef.current) {
        return;
      }
      const activeTab = localRef.current.querySelector<HTMLElement>('[data-state="active"]');
      if (!activeTab) {
        return;
      }
      const newValue = activeTab.getAttribute('data-value') ?? undefined;
      if (newValue) {
        lastKnownActiveValue.current = newValue;
        setActiveValue(newValue);
      }
    }, []);

    React.useEffect(() => {
      // Initial sync
      getActiveValue();

      const observer = new MutationObserver(() => {
        // Use requestAnimationFrame to ensure DOM is stable
        requestAnimationFrame(getActiveValue);
      });

      if (localRef.current) {
        observer.observe(localRef.current, {
          attributes: true,
          childList: true,
          subtree: true,
        });
      }

      return () => {
        observer.disconnect();
      };
    }, [getActiveValue]);

    return (
      <MotionHighlight
        className={cn(tabsListActiveVariants({ variant }), activeClassName)}
        controlledItems
        transition={transition}
        value={activeValue || lastKnownActiveValue.current}
      >
        <TabsPrimitive.List
          className={cn(
            tabsListVariants({ variant, layout, gap }),
            layout === 'equal' && columns && `grid-cols-${columns}`,
            className
          )}
          data-slot="tabs-list"
          data-testid={testId}
          ref={localRef}
          {...props}
        >
          {children}
        </TabsPrimitive.List>
      </MotionHighlight>
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

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger> &
  SharedProps & {
    variant?: VariantProps<typeof tabsTriggerVariants>['variant'];
  };

function TabsTrigger({ className, value, variant, testId, ...props }: TabsTriggerProps) {
  return (
    <MotionHighlightItem className="size-full" value={value}>
      <TabsPrimitive.Trigger
        className={cn(tabsTriggerVariants({ variant }), className)}
        data-slot="tabs-trigger"
        data-testid={testId}
        value={value}
        {...props}
      />
    </MotionHighlightItem>
  );
}

type TabsContentProps = React.ComponentProps<typeof TabsPrimitive.Content> &
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
  return (
    <TabsPrimitive.Content asChild {...props}>
      <motion.div
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        className={cn('flex-1 space-y-6 outline-none', className)}
        data-slot="tabs-content"
        data-testid={testId}
        exit={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
        initial={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
        layout
        transition={transition}
        {...props}
      >
        {children}
      </motion.div>
    </TabsPrimitive.Content>
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
