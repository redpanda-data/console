'use client';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

type AccordionVariant = 'simple' | 'contained';

type AccordionItemContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  variant: AccordionVariant;
};

const AccordionItemContext = React.createContext<AccordionItemContextType | undefined>(undefined);

const useAccordionItem = (): AccordionItemContextType => {
  const context = React.useContext(AccordionItemContext);
  if (!context) {
    throw new Error('useAccordionItem must be used within an AccordionItem');
  }
  return context;
};

const AccordionContext = React.createContext<{ variant: AccordionVariant }>({ variant: 'simple' });

const useAccordion = () => React.useContext(AccordionContext);

const accordionVariants = cva('flex w-full flex-col', {
  variants: {
    variant: {
      simple: '',
      contained: 'gap-2',
    },
  },
  defaultVariants: {
    variant: 'simple',
  },
});

export type AccordionVariants = VariantProps<typeof accordionVariants>;

type AccordionProps = React.ComponentProps<typeof AccordionPrimitive.Root> & SharedProps & AccordionVariants;

function Accordion({ testId, variant = 'simple', className, ...props }: AccordionProps) {
  const resolvedVariant: AccordionVariant = variant ?? 'simple';
  const contextValue = React.useMemo(() => ({ variant: resolvedVariant }), [resolvedVariant]);

  return (
    <AccordionContext.Provider value={contextValue}>
      <AccordionPrimitive.Root
        className={cn(accordionVariants({ variant: resolvedVariant }), className)}
        data-slot="accordion"
        data-testid={testId}
        data-variant={resolvedVariant}
        {...props}
      />
    </AccordionContext.Provider>
  );
}

const accordionItemVariants = cva('', {
  variants: {
    variant: {
      simple: 'border-b',
      contained: 'overflow-hidden rounded-xl border bg-card',
    },
  },
  defaultVariants: {
    variant: 'simple',
  },
});

export type AccordionItemVariants = VariantProps<typeof accordionItemVariants>;

type AccordionItemProps = Omit<React.ComponentProps<typeof AccordionPrimitive.Item>, 'className'> &
  SharedProps & {
    className?: string;
    children: React.ReactNode;
  };

/** Mirrors the item's native `open` state into context so the chevron can rotate without observing DOM attributes. */
function AccordionItemOpenSync({ open, onSync }: { open: boolean; onSync: (open: boolean) => void }) {
  React.useEffect(() => {
    onSync(open);
  }, [open, onSync]);
  return null;
}

function AccordionItem({ className, children, testId, ...props }: AccordionItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { variant } = useAccordion();

  const contextValue = React.useMemo(() => ({ isOpen, setIsOpen, variant }), [isOpen, variant]);

  const renderItem = React.useCallback(
    (renderProps: React.ComponentProps<'div'>, state: AccordionPrimitive.Item.State) => (
      <div {...renderProps}>
        <AccordionItemOpenSync onSync={setIsOpen} open={state.open} />
        {renderProps.children}
      </div>
    ),
    []
  );

  return (
    <AccordionItemContext.Provider value={contextValue}>
      <AccordionPrimitive.Item
        className={cn(accordionItemVariants({ variant }), className)}
        data-slot="accordion-item"
        data-testid={testId}
        data-variant={variant}
        render={renderItem}
        {...props}
      >
        {children}
      </AccordionPrimitive.Item>
    </AccordionItemContext.Provider>
  );
}

const accordionTriggerVariants = cva(
  'group/accordion-trigger flex flex-1 cursor-pointer items-center gap-4 text-start font-medium outline-none transition-colors focus-visible:underline aria-disabled:pointer-events-none aria-disabled:opacity-50',
  {
    variants: {
      variant: {
        simple: 'py-4 hover:underline',
        contained: 'rounded-t-xl bg-muted/50 px-6 py-4 text-base tracking-tight hover:bg-muted/70 active:bg-muted',
      },
    },
    defaultVariants: {
      variant: 'simple',
    },
  }
);

export type AccordionTriggerVariants = VariantProps<typeof accordionTriggerVariants>;

type AccordionTriggerProps = Omit<React.ComponentProps<typeof AccordionPrimitive.Trigger>, 'className'> &
  SharedProps & {
    className?: string;
    chevron?: boolean;
    start?: React.ReactNode;
    end?: React.ReactNode;
  };

function AccordionTrigger({
  className,
  children,
  chevron = true,
  start,
  end,
  testId,
  ...props
}: AccordionTriggerProps) {
  const { variant } = useAccordionItem();

  return (
    <AccordionPrimitive.Header className="flex" data-slot="accordion-header">
      <AccordionPrimitive.Trigger
        className={cn(accordionTriggerVariants({ variant }), className)}
        data-slot="accordion-trigger"
        data-testid={testId}
        data-variant={variant}
        {...props}
      >
        {start ? (
          <div className="shrink-0" data-slot="accordion-trigger-start">
            {start}
          </div>
        ) : null}

        <div className="min-w-0 flex-1" data-slot="accordion-trigger-content">
          {children}
        </div>

        {end ? (
          <div className="shrink-0" data-slot="accordion-trigger-end">
            {end}
          </div>
        ) : null}

        {chevron ? (
          <ChevronDown
            className="size-5 shrink-0 transition-transform duration-200 ease-out group-data-[panel-open]/accordion-trigger:rotate-180 motion-reduce:transition-none"
            data-slot="accordion-trigger-chevron"
          />
        ) : null}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

const accordionContentVariants = cva(
  'text-sm [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
  {
    variants: {
      variant: {
        simple: 'pt-0 pb-4',
        contained: 'bg-card px-4 py-6',
      },
    },
    defaultVariants: {
      variant: 'simple',
    },
  }
);

export type AccordionContentVariants = VariantProps<typeof accordionContentVariants>;

type AccordionContentProps = React.ComponentProps<typeof AccordionPrimitive.Panel> & SharedProps;

function AccordionContent({ className, children, testId, ...props }: AccordionContentProps) {
  const { variant } = useAccordionItem();

  return (
    <AccordionPrimitive.Panel
      className="h-(--accordion-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none"
      data-slot="accordion-content"
      data-testid={testId}
      data-variant={variant}
      {...props}
    >
      <div className={cn(accordionContentVariants({ variant }), className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  useAccordionItem,
  useAccordion,
  type AccordionVariant,
  type AccordionItemContextType,
  type AccordionProps,
  type AccordionItemProps,
  type AccordionTriggerProps,
  type AccordionContentProps,
};
