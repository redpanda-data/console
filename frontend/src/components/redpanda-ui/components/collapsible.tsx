'use client';

import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import React from 'react';

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

type CollapsibleProps = React.ComponentProps<typeof CollapsiblePrimitive.Root> & {
  testId?: string;
};

function Collapsible({ children, testId, ...props }: CollapsibleProps) {
  const [isOpen, setIsOpen] = React.useState(props?.open ?? props?.defaultOpen ?? false);

  React.useEffect(() => {
    if (props?.open !== undefined) setIsOpen(props.open);
  }, [props?.open]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      props.onOpenChange?.(open);
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: part of the collapsible implementation
    [props],
  );

  return (
    <CollapsibleContext.Provider value={{ isOpen }}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        data-testid={testId}
        {...props}
        onOpenChange={handleOpenChange}
      >
        {children}
      </CollapsiblePrimitive.Root>
    </CollapsibleContext.Provider>
  );
}

type CollapsibleTriggerProps = React.ComponentProps<typeof CollapsiblePrimitive.Trigger>;

function CollapsibleTrigger(props: CollapsibleTriggerProps) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

type CollapsibleContentProps = React.ComponentProps<typeof CollapsiblePrimitive.Content> &
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
      {isOpen && (
        <CollapsiblePrimitive.Content asChild forceMount {...props}>
          <motion.div
            key="collapsible-content"
            data-slot="collapsible-content"
            initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
            animate={{ opacity: 1, height: 'auto', overflow: 'hidden' }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={transition}
            className={className}
            {...props}
          >
            {children}
          </motion.div>
        </CollapsiblePrimitive.Content>
      )}
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
