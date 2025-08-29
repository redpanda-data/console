'use client';

import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

type PopoverContextType = {
  isOpen: boolean;
};

const PopoverContext = React.createContext<PopoverContextType | undefined>(undefined);

const usePopover = (): PopoverContextType => {
  const context = React.useContext(PopoverContext);
  if (!context) {
    throw new Error('usePopover must be used within a Popover');
  }
  return context;
};

type Side = 'top' | 'bottom' | 'left' | 'right';

const getInitialPosition = (side: Side) => {
  switch (side) {
    case 'top':
      return { y: 15 };
    case 'bottom':
      return { y: -15 };
    case 'left':
      return { x: 15 };
    case 'right':
      return { x: -15 };
  }
};

type PopoverProps = React.ComponentProps<typeof PopoverPrimitive.Root> & { testId?: string };

function Popover({ children, testId, ...props }: PopoverProps) {
  const [isOpen, setIsOpen] = React.useState(props?.open ?? props?.defaultOpen ?? false);

  React.useEffect(() => {
    if (props?.open !== undefined) setIsOpen(props.open);
  }, [props?.open]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      props.onOpenChange?.(open);
    },

    // biome-ignore lint/correctness/useExhaustiveDependencies: part of popover implementation
    [props],
  );

  return (
    <PopoverContext.Provider value={{ isOpen }}>
      <PopoverPrimitive.Root data-slot="popover" data-testid={testId} {...props} onOpenChange={handleOpenChange}>
        {children}
      </PopoverPrimitive.Root>
    </PopoverContext.Provider>
  );
}

type PopoverTriggerProps = React.ComponentProps<typeof PopoverPrimitive.Trigger> & { testId?: string };

function PopoverTrigger({ testId, ...props }: PopoverTriggerProps) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" data-testid={testId} {...props} />;
}

type PopoverContentProps = React.ComponentProps<typeof PopoverPrimitive.Content> &
  HTMLMotionProps<'div'> & {
    transition?: Transition;
    testId?: string;
  };

function PopoverContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  transition = { type: 'spring', stiffness: 300, damping: 25 },
  children,
  testId,
  ...props
}: PopoverContentProps) {
  const { isOpen } = usePopover();
  const initialPosition = getInitialPosition(side);

  return (
    <AnimatePresence>
      {isOpen && (
        <PopoverPrimitive.Portal forceMount data-slot="popover-portal">
          <PopoverPrimitive.Content forceMount align={align} sideOffset={sideOffset} className="z-50" {...props}>
            <motion.div
              key="popover-content"
              data-slot="popover-content"
              data-testid={testId}
              initial={{ opacity: 0, scale: 0.5, ...initialPosition }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, ...initialPosition }}
              transition={transition}
              className={cn(
                'w-72 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-none',
                className,
              )}
              {...props}
            >
              {children}
            </motion.div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

type PopoverAnchorProps = React.ComponentProps<typeof PopoverPrimitive.Anchor>;

function PopoverAnchor({ ...props }: PopoverAnchorProps) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  usePopover,
  type PopoverContextType,
  type PopoverProps,
  type PopoverTriggerProps,
  type PopoverContentProps,
  type PopoverAnchorProps,
};
