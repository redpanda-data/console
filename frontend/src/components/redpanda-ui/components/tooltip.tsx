'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import React from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { asChildToRender, narrowOpenChange, renderWithDataState, useMirroredOpen } from '../lib/base-ui-compat';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

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
type Align = 'start' | 'center' | 'end';

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

type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitive.Provider> & {
  delayDuration?: number;
  skipDelayDuration?: number;
};

function TooltipProvider({ delayDuration, skipDelayDuration, ...props }: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider
      closeDelay={0}
      delay={delayDuration ?? 150}
      timeout={skipDelayDuration ?? 0}
      {...props}
    />
  );
}

type TooltipProps = Omit<React.ComponentProps<typeof TooltipPrimitive.Root>, 'onOpenChange' | 'children'> &
  SharedProps & {
    onOpenChange?: (open: boolean) => void;
    delayDuration?: number;
    children?: React.ReactNode;
  };

function Tooltip({ testId, onOpenChange, delayDuration: _delayDuration, ...props }: TooltipProps) {
  const { isOpen, handleOpenChange } = useMirroredOpen(props?.open, props?.defaultOpen, onOpenChange);

  return (
    <TooltipContext.Provider value={{ isOpen }}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        data-testid={testId}
        {...props}
        onOpenChange={narrowOpenChange(handleOpenChange)}
      />
    </TooltipContext.Provider>
  );
}

type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger> &
  SharedProps & {
    asChild?: boolean;
  };

function TooltipTrigger({ testId, ...props }: TooltipTriggerProps) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" data-testid={testId} {...asChildToRender(props)} />;
}

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Popup> &
  SharedProps &
  Pick<PortalContentProps, 'container' | 'onOpenAutoFocus'> & {
    transition?: Transition;
    arrow?: boolean;
    side?: Side;
    align?: Align;
    sideOffset?: number;
    alignOffset?: number;
  };

function TooltipContent({
  className,
  side = 'top',
  align = 'center',
  sideOffset = 4,
  alignOffset,
  transition = { type: 'spring', stiffness: 300, damping: 25 },
  arrow = true,
  children,
  testId,
  container,
  onOpenAutoFocus: _onOpenAutoFocus,
  ...props
}: TooltipContentProps) {
  const { isOpen } = useTooltip();
  const initialPosition = getInitialPosition(side);
  const portalContainer = usePortalContainer();

  return (
    <AnimatePresence>
      {isOpen ? (
        <TooltipPrimitive.Portal container={container ?? portalContainer} data-slot="tooltip-portal" keepMounted>
          <TooltipPrimitive.Positioner
            align={align}
            alignOffset={alignOffset}
            className="z-50"
            side={side}
            sideOffset={sideOffset}
          >
            <TooltipPrimitive.Popup render={renderWithDataState('div')} {...props}>
              <motion.div
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                className={cn(
                  'relative w-fit origin-(--transform-origin) text-balance rounded-md bg-primary px-3 py-1.5 text-inverse text-sm shadow-md',
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
                    className="z-50 size-2.5 rotate-45 rounded-[2px] bg-primary fill-primary data-[side=bottom]:top-0 data-[side=left]:right-0 data-[side=top]:bottom-0 data-[side=right]:left-0 data-[side=left]:translate-x-1/2 data-[side=right]:-translate-x-1/2 data-[side=bottom]:-translate-y-1/2 data-[side=top]:translate-y-1/2"
                    data-slot="tooltip-content-arrow"
                  />
                ) : null}
              </motion.div>
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
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
