'use client';

import { PreviewCard as HoverCardPrimitive } from '@base-ui/react/preview-card';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import React from 'react';

import { asChildToRender, narrowOpenChange, renderWithDataState, useMirroredOpen } from '../lib/base-ui-compat';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

type HoverCardContextType = {
  isOpen: boolean;
};

const HoverCardContext = React.createContext<HoverCardContextType | undefined>(undefined);

const useHoverCard = (): HoverCardContextType => {
  const context = React.useContext(HoverCardContext);
  if (!context) {
    throw new Error('useHoverCard must be used within a HoverCard');
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

type HoverCardProps = Omit<React.ComponentProps<typeof HoverCardPrimitive.Root>, 'onOpenChange' | 'children'> &
  SharedProps & {
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  };

function HoverCard({ children, testId, onOpenChange, ...props }: HoverCardProps) {
  const { isOpen, handleOpenChange } = useMirroredOpen(props?.open, props?.defaultOpen, onOpenChange);

  return (
    <HoverCardContext.Provider value={{ isOpen }}>
      <HoverCardPrimitive.Root
        data-slot="hover-card"
        data-testid={testId}
        {...props}
        onOpenChange={narrowOpenChange(handleOpenChange)}
      >
        {children}
      </HoverCardPrimitive.Root>
    </HoverCardContext.Provider>
  );
}

type HoverCardTriggerProps = React.ComponentProps<typeof HoverCardPrimitive.Trigger> &
  SharedProps & {
    asChild?: boolean;
  };

function HoverCardTrigger({ testId, ...props }: HoverCardTriggerProps) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" data-testid={testId} {...asChildToRender(props)} />;
}

type HoverCardContentProps = React.ComponentProps<typeof HoverCardPrimitive.Popup> &
  HTMLMotionProps<'div'> &
  SharedProps &
  Pick<PortalContentProps, 'container' | 'onOpenAutoFocus'> & {
    transition?: Transition;
    side?: Side;
    align?: Align;
    sideOffset?: number;
    alignOffset?: number;
  };

function HoverCardContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  alignOffset,
  transition = { type: 'spring', stiffness: 300, damping: 25 },
  children,
  testId,
  container,
  onOpenAutoFocus: _onOpenAutoFocus,
  ...props
}: HoverCardContentProps) {
  const { isOpen } = useHoverCard();
  const initialPosition = getInitialPosition(side);

  return (
    <AnimatePresence>
      {isOpen ? (
        <HoverCardPrimitive.Portal container={container} data-slot="hover-card-portal" keepMounted>
          <HoverCardPrimitive.Positioner
            align={align}
            alignOffset={alignOffset}
            className="z-50"
            side={side}
            sideOffset={sideOffset}
          >
            <HoverCardPrimitive.Popup render={renderWithDataState('div')} {...props}>
              <motion.div
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                className={cn(
                  'w-64 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-none',
                  className
                )}
                data-slot="hover-card-content"
                data-testid={testId}
                exit={{ opacity: 0, scale: 0.5, ...initialPosition }}
                initial={{ opacity: 0, scale: 0.5, ...initialPosition }}
                key="hover-card-content"
                transition={transition}
              >
                {children}
              </motion.div>
            </HoverCardPrimitive.Popup>
          </HoverCardPrimitive.Positioner>
        </HoverCardPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  useHoverCard,
  type HoverCardContextType,
  type HoverCardProps,
  type HoverCardTriggerProps,
  type HoverCardContentProps,
};
