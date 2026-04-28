'use client';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import React from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { asChildTrigger, narrowOpenChange, renderWithDataState, useMirroredOpen } from '../lib/base-ui-compat';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

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

type PopoverAnchorContextType = {
  anchorRef: React.MutableRefObject<Element | null>;
  setHasAnchor: (hasAnchor: boolean) => void;
  hasAnchor: boolean;
};

const PopoverAnchorContext = React.createContext<PopoverAnchorContextType | undefined>(undefined);

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

type PopoverProps = Omit<React.ComponentProps<typeof PopoverPrimitive.Root>, 'onOpenChange' | 'children'> &
  SharedProps & {
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  };

function Popover({ children, testId, onOpenChange, ...props }: PopoverProps) {
  const { isOpen, handleOpenChange } = useMirroredOpen(props?.open, props?.defaultOpen, onOpenChange);
  const anchorRef = React.useRef<Element | null>(null);
  const [hasAnchor, setHasAnchor] = React.useState(false);

  const anchorCtx = React.useMemo<PopoverAnchorContextType>(
    () => ({ anchorRef, setHasAnchor, hasAnchor }),
    [hasAnchor]
  );

  return (
    <PopoverContext.Provider value={{ isOpen }}>
      <PopoverAnchorContext.Provider value={anchorCtx}>
        <PopoverPrimitive.Root
          data-slot="popover"
          data-testid={testId}
          {...props}
          onOpenChange={narrowOpenChange(handleOpenChange)}
        >
          {children}
        </PopoverPrimitive.Root>
      </PopoverAnchorContext.Provider>
    </PopoverContext.Provider>
  );
}

type PopoverTriggerProps = React.ComponentProps<typeof PopoverPrimitive.Trigger> &
  SharedProps & {
    asChild?: boolean;
  };

function PopoverTrigger({ className, testId, ...props }: PopoverTriggerProps) {
  return (
    <PopoverPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="popover-trigger"
      data-testid={testId}
      {...asChildTrigger(props)}
    />
  );
}

type PopoverContentProps = React.ComponentProps<typeof PopoverPrimitive.Popup> &
  HTMLMotionProps<'div'> &
  SharedProps &
  Pick<PortalContentProps, 'container' | 'onOpenAutoFocus'> & {
    transition?: Transition;
    side?: Side;
    align?: Align;
    sideOffset?: number;
    alignOffset?: number;
  };

function PopoverContent({
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
}: PopoverContentProps) {
  const { isOpen } = usePopover();
  const initialPosition = getInitialPosition(side);
  const portalContainer = usePortalContainer();
  const anchorCtx = React.useContext(PopoverAnchorContext);

  return (
    <AnimatePresence>
      {isOpen ? (
        <PopoverPrimitive.Portal container={container ?? portalContainer} data-slot="popover-portal" keepMounted>
          <PopoverPrimitive.Positioner
            align={align}
            alignOffset={alignOffset}
            {...(anchorCtx?.hasAnchor && anchorCtx.anchorRef.current ? { anchor: anchorCtx.anchorRef } : {})}
            className="z-50"
            side={side}
            sideOffset={sideOffset}
          >
            <PopoverPrimitive.Popup render={renderWithDataState('div')} {...props}>
              <motion.div
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                className={cn(
                  '!border-input w-72 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-none',
                  className
                )}
                data-slot="popover-content"
                data-testid={testId}
                exit={{ opacity: 0, scale: 0.5, ...initialPosition }}
                initial={{ opacity: 0, scale: 0.5, ...initialPosition }}
                key="popover-content"
                transition={transition}
              >
                {children}
              </motion.div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

type PopoverAnchorProps = {
  asChild?: boolean;
  children?: React.ReactNode;
};

function PopoverAnchor({ asChild, children }: PopoverAnchorProps) {
  const ctx = React.useContext(PopoverAnchorContext);
  const localRef = React.useRef<Element | null>(null);

  const setRef = React.useCallback(
    (node: Element | null) => {
      localRef.current = node;
      if (ctx) {
        ctx.anchorRef.current = node;
        ctx.setHasAnchor(Boolean(node));
      }
    },
    [ctx]
  );

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<Record<string, unknown>> & {
      ref?: React.Ref<Element>;
    };
    const existingRef = child.ref;
    return React.cloneElement(child, {
      ref: (node: Element | null) => {
        setRef(node);
        if (typeof existingRef === 'function') {
          existingRef(node);
        } else if (existingRef && typeof existingRef === 'object') {
          (existingRef as React.MutableRefObject<Element | null>).current = node;
        }
      },
    } as Partial<Record<string, unknown>>);
  }

  return (
    <div data-slot="popover-anchor" ref={setRef as React.Ref<HTMLDivElement>}>
      {children}
    </div>
  );
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
