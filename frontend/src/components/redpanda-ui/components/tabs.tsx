'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import React from 'react';

import { MotionHighlight, MotionHighlightItem } from './motion-highlight';
import { cn } from '../lib/utils';

const tabsVariants = cva('flex flex-col', {
  variants: {
    size: {
      sm: 'gap-1',
      md: 'gap-2',
      lg: 'gap-3',
      xl: 'gap-4',
      full: 'gap-2 w-full',
    },
    variant: {
      default: '',
      card: 'bg-card rounded-xl border',
      contained: 'bg-muted rounded-lg',
    },
  },
  defaultVariants: {
    size: 'md',
    variant: 'default',
  },
});

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> &
  VariantProps<typeof tabsVariants> & { testId?: string };

function Tabs({ className, size, variant, testId, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-testid={testId}
      className={cn(tabsVariants({ size, variant }), className)}
      {...props}
    />
  );
}

const tabsListVariants = cva('text-muted-foreground inline-flex h-10 items-center justify-center', {
  variants: {
    variant: {
      default: 'bg-muted w-fit rounded-lg p-1 gap-1',
      underline:
        'w-full relative justify-start rounded-t-xl bg-background border-b border-border text-current py-0 px-4',
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
        "rounded-none shadow-none bg-transparent after:content-[''] after:absolute after:inset-x-0 after:h-0.5 after:bottom-0 after:bg-selected after:rounded-t-full",
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants> & {
    activeClassName?: string;
    transition?: Transition;
    columns?: number;
    testId?: string;
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
    ref,
  ) => {
    const localRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => localRef.current || document.createElement('div'));

    const [activeValue, setActiveValue] = React.useState<string | undefined>(undefined);
    const lastKnownActiveValue = React.useRef<string | undefined>(undefined);

    const getActiveValue = React.useCallback(() => {
      if (!localRef.current) return;
      const activeTab = localRef.current.querySelector<HTMLElement>('[data-state="active"]');
      if (!activeTab) return;
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
        controlledItems
        className={cn(tabsListActiveVariants({ variant }), activeClassName)}
        value={activeValue || lastKnownActiveValue.current}
        transition={transition}
      >
        <TabsPrimitive.List
          ref={localRef}
          data-slot="tabs-list"
          data-testid={testId}
          className={cn(
            tabsListVariants({ variant, layout, gap }),
            layout === 'equal' && columns && `grid-cols-${columns}`,
            className,
          )}
          {...props}
        >
          {children}
        </TabsPrimitive.List>
      </MotionHighlight>
    );
  },
);

TabsList.displayName = 'TabsList';

const tabsTriggerVariants = cva(
  'inline-flex cursor-pointer items-center size-full justify-center whitespace-nowrap rounded-sm text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground z-[1]',
  {
    variants: {
      variant: {
        default: 'px-3 py-1.5',
        underline: 'text-muted-foreground data-[state=active]:text-selected px-4 py-2',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  variant?: VariantProps<typeof tabsTriggerVariants>['variant'];
  testId?: string;
};

function TabsTrigger({ className, value, variant, testId, ...props }: TabsTriggerProps) {
  return (
    <MotionHighlightItem value={value} className="size-full">
      <TabsPrimitive.Trigger
        data-slot="tabs-trigger"
        data-testid={testId}
        className={cn(tabsTriggerVariants({ variant }), className)}
        value={value}
        {...props}
      />
    </MotionHighlightItem>
  );
}

type TabsContentProps = React.ComponentProps<typeof TabsPrimitive.Content> &
  HTMLMotionProps<'div'> & {
    transition?: Transition;
    testId?: string;
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
        data-slot="tabs-content"
        data-testid={testId}
        className={cn('flex-1 outline-none space-y-6', className)}
        layout
        initial={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
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
      data-slot="tabs-contents"
      layout
      transition={transition}
      className={cn('overflow-visible', className)}
      style={{ height: 'auto' }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Content layout helpers
const tabsContentWrapperVariants = cva('', {
  variants: {
    variant: {
      default: '',
      card: 'p-6',
      contained: 'mx-1 mb-1 -mt-2 rounded-sm h-full bg-background p-6',
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
