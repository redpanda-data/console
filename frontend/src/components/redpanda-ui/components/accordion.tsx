'use client';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

type AccordionItemContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  variant: 'default' | 'contained' | 'outlined';
};

const AccordionItemContext = React.createContext<AccordionItemContextType | undefined>(undefined);

const useAccordionItem = (): AccordionItemContextType => {
  const context = React.useContext(AccordionItemContext);
  if (!context) {
    throw new Error('useAccordionItem must be used within an AccordionItem');
  }
  return context;
};

type AccordionProps = React.ComponentProps<typeof AccordionPrimitive.Root> & {
  testId?: string;
};

function Accordion({ testId, ...props }: AccordionProps) {
  return <AccordionPrimitive.Root data-slot="accordion" data-testid={testId} {...props} />;
}

const accordionItemVariants = cva('', {
  variants: {
    variant: {
      default: 'border-b',
      contained: '',
      outlined: 'rounded-md border-1 bg-white dark:bg-base-900',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type AccordionItemProps = React.ComponentProps<typeof AccordionPrimitive.Item> &
  VariantProps<typeof accordionItemVariants> & {
    children: React.ReactNode;
    testId?: string;
  };

function AccordionItem({ className, children, testId, variant = 'default', ...props }: AccordionItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <AccordionItemContext.Provider value={{ isOpen, setIsOpen, variant: variant || 'default' }}>
      <AccordionPrimitive.Item
        data-slot="accordion-item"
        data-testid={testId}
        className={cn(accordionItemVariants({ variant }), className)}
        {...props}
      >
        {children}
      </AccordionPrimitive.Item>
    </AccordionItemContext.Provider>
  );
}

const accordionTriggerVariants = cva(
  'flex flex-1 text-start items-center justify-between font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'py-4 hover:underline',
        contained: 'w-full rounded-md border bg-muted/50 px-4 py-2 text-sm hover:bg-muted',
        outlined: 'w-full rounded-t-md px-3 py-2 text-sm hover:bg-muted/50',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type AccordionTriggerProps = React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  transition?: Transition;
  chevron?: boolean;
  testId?: string;
};

const AccordionTrigger = React.forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  (
    {
      className,
      children,
      transition = { type: 'spring', stiffness: 150, damping: 22 },
      chevron = true,
      testId,
      ...props
    },
    ref,
  ) => {
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    React.useImperativeHandle(ref, () => triggerRef.current || document.createElement('button'));
    const { isOpen, setIsOpen, variant } = useAccordionItem();

    React.useEffect(() => {
      const node = triggerRef.current;
      if (!node) return;

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

    const chevronSize = variant === 'contained' || variant === 'outlined' ? 'size-4' : 'size-5';

    return (
      <AccordionPrimitive.Header data-slot="accordion-header" className="flex">
        <AccordionPrimitive.Trigger
          ref={triggerRef}
          data-slot="accordion-trigger"
          data-testid={testId}
          className={cn(accordionTriggerVariants({ variant }), className)}
          {...props}
        >
          {children}

          {chevron && (
            <motion.div
              data-slot="accordion-trigger-chevron"
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={transition}
            >
              <ChevronDown className={cn(chevronSize, 'shrink-0')} />
            </motion.div>
          )}
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
    );
  },
);

AccordionTrigger.displayName = 'AccordionTrigger';

type AccordionContentProps = React.ComponentProps<typeof AccordionPrimitive.Content> &
  HTMLMotionProps<'div'> & {
    transition?: Transition;
    testId?: string;
  };

const accordionContentVariants = cva('pb-4 pt-0', {
  variants: {
    variant: {
      default: 'text-sm',
      contained: 'text-sm',
      outlined: 'px-4 pb-4 pt-2 text-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

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
      {isOpen && (
        <AccordionPrimitive.Content forceMount {...props}>
          <motion.div
            key="accordion-content"
            data-slot="accordion-content"
            data-testid={testId}
            initial={{ height: 0, opacity: 0, '--mask-stop': '0%' }}
            animate={{ height: 'auto', opacity: 1, '--mask-stop': '100%' }}
            exit={{ height: 0, opacity: 0, '--mask-stop': '0%' }}
            transition={transition}
            style={{
              maskImage: 'linear-gradient(black var(--mask-stop), transparent var(--mask-stop))',
              WebkitMaskImage: 'linear-gradient(black var(--mask-stop), transparent var(--mask-stop))',
            }}
            className="overflow-hidden"
            {...props}
          >
            <div className={cn(accordionContentVariants({ variant }), className)}>{children}</div>
          </motion.div>
        </AccordionPrimitive.Content>
      )}
    </AnimatePresence>
  );
}

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  useAccordionItem,
  type AccordionItemContextType,
  type AccordionProps,
  type AccordionItemProps,
  type AccordionTriggerProps,
  type AccordionContentProps,
};
