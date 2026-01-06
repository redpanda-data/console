'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

type AccordionVariant = 'default' | 'contained';

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

const AccordionContext = React.createContext<{ variant: AccordionVariant }>({ variant: 'default' });

const useAccordion = () => React.useContext(AccordionContext);

const accordionVariants = cva('', {
  variants: {
    variant: {
      default: '',
      contained: 'space-y-2',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type AccordionVariants = VariantProps<typeof accordionVariants>;

type AccordionProps = React.ComponentProps<typeof AccordionPrimitive.Root> & SharedProps & AccordionVariants;

function Accordion({ testId, variant = 'default', className, ...props }: AccordionProps) {
  const resolvedVariant: AccordionVariant = variant ?? 'default';
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
      default: 'border-b',
      contained: 'overflow-hidden rounded-xl border bg-card',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type AccordionItemVariants = VariantProps<typeof accordionItemVariants>;

type AccordionItemProps = React.ComponentProps<typeof AccordionPrimitive.Item> &
  SharedProps & {
    children: React.ReactNode;
  };

function AccordionItem({ className, children, testId, ...props }: AccordionItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { variant } = useAccordion();

  const contextValue = React.useMemo(() => ({ isOpen, setIsOpen, variant }), [isOpen, variant]);

  return (
    <AccordionItemContext.Provider value={contextValue}>
      <AccordionPrimitive.Item
        className={cn(accordionItemVariants({ variant }), className)}
        data-slot="accordion-item"
        data-testid={testId}
        data-variant={variant}
        {...props}
      >
        {children}
      </AccordionPrimitive.Item>
    </AccordionItemContext.Provider>
  );
}

const accordionTriggerVariants = cva(
  'flex flex-1 items-center gap-4 text-start font-medium outline-none transition-colors focus-visible:underline',
  {
    variants: {
      variant: {
        default: 'py-4 hover:underline',
        contained: 'rounded-t-xl bg-muted/50 px-6 py-4 text-base tracking-tight hover:bg-muted/70 active:bg-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type AccordionTriggerVariants = VariantProps<typeof accordionTriggerVariants>;

type AccordionTriggerProps = React.ComponentProps<typeof AccordionPrimitive.Trigger> &
  SharedProps & {
    transition?: Transition;
    chevron?: boolean;
    start?: React.ReactNode;
    end?: React.ReactNode;
  };

const AccordionTrigger = React.forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  (
    {
      className,
      children,
      transition = { type: 'spring', stiffness: 150, damping: 22 },
      chevron = true,
      start,
      end,
      testId,
      ...props
    },
    ref
  ) => {
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    React.useImperativeHandle(ref, () => triggerRef.current || document.createElement('button'));
    const { isOpen, setIsOpen, variant } = useAccordionItem();

    React.useEffect(() => {
      const node = triggerRef.current;
      if (!node) {
        return;
      }

      const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
          if (mutation.attributeName === 'data-state') {
            const currentState = node.getAttribute('data-state');
            setIsOpen(currentState === 'open');
          }
        }
      });
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['data-state'],
      });
      const initialState = node.getAttribute('data-state');
      setIsOpen(initialState === 'open');
      return () => {
        observer.disconnect();
      };
    }, [setIsOpen]);

    return (
      <AccordionPrimitive.Header className="flex" data-slot="accordion-header">
        <AccordionPrimitive.Trigger
          className={cn(accordionTriggerVariants({ variant }), className)}
          data-slot="accordion-trigger"
          data-testid={testId}
          data-variant={variant}
          ref={triggerRef}
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
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              className="shrink-0"
              data-slot="accordion-trigger-chevron"
              transition={transition}
            >
              <ChevronDown className="size-5" />
            </motion.div>
          ) : null}
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
    );
  }
);

AccordionTrigger.displayName = 'AccordionTrigger';

const accordionContentVariants = cva('text-sm', {
  variants: {
    variant: {
      default: 'pt-0 pb-4',
      contained: 'bg-card px-4 py-6',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type AccordionContentVariants = VariantProps<typeof accordionContentVariants>;

type AccordionContentProps = React.ComponentProps<typeof AccordionPrimitive.Content> &
  HTMLMotionProps<'div'> &
  SharedProps & {
    transition?: Transition;
  };

function AccordionContent({
  className,
  children,
  transition = { type: 'spring', stiffness: 150, damping: 22 },
  testId,
  ...props
}: AccordionContentProps) {
  const { isOpen, variant } = useAccordionItem();

  return (
    <AnimatePresence>
      {isOpen ? (
        <AccordionPrimitive.Content forceMount {...props}>
          <motion.div
            animate={{ height: 'auto', opacity: 1, '--mask-stop': '100%' }}
            className="overflow-hidden"
            data-slot="accordion-content"
            data-testid={testId}
            data-variant={variant}
            exit={{ height: 0, opacity: 0, '--mask-stop': '0%' }}
            initial={{ height: 0, opacity: 0, '--mask-stop': '0%' }}
            key="accordion-content"
            style={{
              maskImage: 'linear-gradient(black var(--mask-stop), transparent var(--mask-stop))',
              WebkitMaskImage: 'linear-gradient(black var(--mask-stop), transparent var(--mask-stop))',
            }}
            transition={transition}
            {...props}
          >
            <div className={cn(accordionContentVariants({ variant }), className)}>{children}</div>
          </motion.div>
        </AccordionPrimitive.Content>
      ) : null}
    </AnimatePresence>
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
