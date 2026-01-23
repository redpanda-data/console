'use client';

import { AnimatePresence, motion, type Transition } from 'motion/react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

type TooltipContextType = {
  isOpen: boolean;
};

const TooltipContext = React.createContext<TooltipContextType | undefined>(undefined);

const useTooltip = (): TooltipContextType => {
  const context = React.useContext(TooltipContext);
  if (!context) {
    throw new Error('useTooltip must be used within a Tooltip');
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
    default:
      return {};
  }
};

type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitive.Provider>;

function TooltipProvider(props: TooltipProviderProps) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root> & SharedProps;

function Tooltip({ testId, ...props }: TooltipProps) {
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
    [props.onOpenChange]
  );

  return (
    <TooltipContext.Provider value={{ isOpen }}>
      <TooltipPrimitive.Root data-slot="tooltip" data-testid={testId} {...props} onOpenChange={handleOpenChange} />
    </TooltipContext.Provider>
  );
}

type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger> & SharedProps;

function TooltipTrigger({ testId, ...props }: TooltipTriggerProps) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" data-testid={testId} {...props} />;
}

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Content> &
  SharedProps & {
    transition?: Transition;
    arrow?: boolean;
    container?: Element;
  };

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 4,
  transition = { type: 'spring', stiffness: 300, damping: 25 },
  arrow = true,
  children,
  testId,
  container,
  ...props
}: TooltipContentProps) {
  const { isOpen } = useTooltip();
  const initialPosition = getInitialPosition(side);

  return (
    <AnimatePresence>
      {isOpen ? (
        <TooltipPrimitive.Portal container={container} data-slot="tooltip-portal" forceMount>
          <TooltipPrimitive.Content className="z-50" forceMount sideOffset={sideOffset} {...props}>
            <motion.div
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              className={cn(
                'relative w-fit origin-(--radix-tooltip-content-transform-origin) text-balance rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm shadow-md',
                className
              )}
              data-slot="tooltip-content"
              data-testid={testId}
              exit={{ opacity: 0, scale: 0, ...initialPosition }}
              initial={{ opacity: 0, scale: 0, ...initialPosition }}
              key="tooltip-content"
              transition={transition}
            >
              {children}

              {arrow ? (
                <TooltipPrimitive.Arrow
                  className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-primary fill-primary"
                  data-slot="tooltip-content-arrow"
                />
              ) : null}
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  useTooltip,
  type TooltipContextType,
  type TooltipProps,
  type TooltipTriggerProps,
  type TooltipContentProps,
  type TooltipProviderProps,
};
