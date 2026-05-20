'use client';

import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import React from 'react';

import { asChildToRender, asChildTrigger, narrowOpenChange } from '../lib/base-ui-compat';
import { cn, type SharedProps } from '../lib/utils';

type CollapsibleContextType = {
  isOpen: boolean;
};

const CollapsibleContext = React.createContext<CollapsibleContextType | undefined>(undefined);

const useCollapsible = (): CollapsibleContextType => {
  const context = React.useContext(CollapsibleContext);
  if (!context) {
    throw new Error('useCollapsible must be used within a Collapsible');
  }
  return context;
};

type CollapsibleProps = Omit<React.ComponentProps<typeof CollapsiblePrimitive.Root>, 'onOpenChange'> &
  SharedProps & {
    asChild?: boolean;
    onOpenChange?: (open: boolean) => void;
  };

function Collapsible({ children, testId, asChild, ...props }: CollapsibleProps) {
  const [isOpen, setIsOpen] = React.useState(props?.open ?? props?.defaultOpen ?? false);

  React.useEffect(() => {
    if (props?.open !== undefined) {
      setIsOpen(props.open);
    }
  }, [props?.open]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      props.onOpenChange?.(open);
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: part of the collapsible implementation
    [props]
  );

  return (
    <CollapsibleContext.Provider value={{ isOpen }}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        data-testid={testId}
        {...props}
        {...asChildToRender({ asChild, children })}
        onOpenChange={narrowOpenChange(handleOpenChange)}
      />
    </CollapsibleContext.Provider>
  );
}

type CollapsibleTriggerProps = React.ComponentProps<typeof CollapsiblePrimitive.Trigger> & {
  asChild?: boolean;
};

function CollapsibleTrigger({ className, ...props }: CollapsibleTriggerProps) {
  return (
    <CollapsiblePrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="collapsible-trigger"
      {...asChildTrigger(props)}
    />
  );
}

type CollapsibleContentProps = React.ComponentProps<typeof CollapsiblePrimitive.Panel> &
  HTMLMotionProps<'div'> & {
    transition?: Transition;
  };

function CollapsibleContent({
  className,
  children,
  transition = { type: 'spring', stiffness: 150, damping: 22 },
  ...props
}: CollapsibleContentProps) {
  const { isOpen } = useCollapsible();

  return (
    <AnimatePresence>
      {isOpen ? (
        <CollapsiblePrimitive.Panel
          keepMounted
          render={
            <motion.div
              animate={{ opacity: 1, height: 'auto', overflow: 'hidden' }}
              className={className}
              data-slot="collapsible-content"
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
              key="collapsible-content"
              layout
              transition={transition}
            >
              {children}
            </motion.div>
          }
          {...props}
        />
      ) : null}
    </AnimatePresence>
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  useCollapsible,
  type CollapsibleContextType,
  type CollapsibleProps,
  type CollapsibleTriggerProps,
  type CollapsibleContentProps,
};
