'use client';

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import React from 'react';

import { Heading } from './typography';
import { usePortalContainer } from '../lib/use-portal-container';
import {
  asChildToRender,
  asChildTrigger,
  narrowOpenChange,
  renderDescription,
  renderWithDataState,
  useMirroredOpen,
} from '../lib/base-ui-compat';
import { cn, type FixedPositionContentProps, type SharedProps } from '../lib/utils';

type SheetContextType = {
  isOpen: boolean;
};

const SheetContext = React.createContext<SheetContextType | undefined>(undefined);

const useSheet = (): SheetContextType => {
  const context = React.useContext(SheetContext);
  if (!context) {
    throw new Error('useSheet must be used within a Sheet');
  }
  return context;
};

type SheetProps = Omit<React.ComponentProps<typeof SheetPrimitive.Root>, 'onOpenChange'> &
  SharedProps & {
    onOpenChange?: (open: boolean) => void;
  };

function Sheet({ children, testId, onOpenChange, ...props }: SheetProps) {
  const { isOpen, handleOpenChange } = useMirroredOpen(props?.open, props?.defaultOpen, onOpenChange);

  return (
    <SheetContext.Provider value={{ isOpen }}>
      <SheetPrimitive.Root
        data-slot="sheet"
        data-testid={testId}
        {...props}
        onOpenChange={narrowOpenChange(handleOpenChange)}
      >
        {children}
      </SheetPrimitive.Root>
    </SheetContext.Provider>
  );
}

type SheetTriggerProps = React.ComponentProps<typeof SheetPrimitive.Trigger> &
  SharedProps & {
    asChild?: boolean;
  };

function SheetTrigger({ className, testId, ...props }: SheetTriggerProps) {
  return (
    <SheetPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="sheet-trigger"
      data-testid={testId}
      {...asChildTrigger(props)}
    />
  );
}

type SheetCloseProps = React.ComponentProps<typeof SheetPrimitive.Close> & {
  asChild?: boolean;
};

function SheetClose(props: SheetCloseProps) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...asChildTrigger(props)} />;
}

type SheetPortalProps = React.ComponentProps<typeof SheetPrimitive.Portal>;

function SheetPortal(props: SheetPortalProps) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

type SheetOverlayProps = React.ComponentProps<typeof SheetPrimitive.Backdrop> & {
  asChild?: boolean;
};

function SheetOverlay({ className, ...props }: SheetOverlayProps) {
  return (
    <SheetPrimitive.Backdrop
      className={cn('fixed inset-0 z-50 bg-black/50', className)}
      data-slot="sheet-overlay"
      render={renderWithDataState('div')}
      {...asChildToRender(props)}
    />
  );
}

const sheetVariants = cva('fixed z-50 gap-4 bg-background px-10 py-8 shadow-lg', {
  variants: {
    side: {
      top: 'inset-x-0 top-0 border-b',
      bottom: 'inset-x-0 bottom-0 border-t',
      left: 'inset-y-0 left-0 h-full border-r',
      right: 'inset-y-0 right-0 h-full border-l',
    },
    size: {
      sm: 'w-full sm:max-w-sm',
      md: 'w-full sm:max-w-md',
      lg: 'w-full sm:max-w-lg',
      xl: 'w-full sm:max-w-xl',
      '2xl': 'w-full sm:max-w-2xl',
      full: 'w-full sm:max-w-none',
    },
  },
  defaultVariants: {
    side: 'right',
    size: 'xl',
  },
});

type SheetContentProps = React.ComponentProps<typeof SheetPrimitive.Popup> &
  VariantProps<typeof sheetVariants> &
  HTMLMotionProps<'div'> &
  SharedProps &
  Pick<FixedPositionContentProps, 'container' | 'showOverlay' | 'onOpenAutoFocus'> & {
    transition?: Transition;
  };

function SheetContent({
  side = 'right',
  size = 'xl',
  className,
  transition = { type: 'spring', stiffness: 150, damping: 25 },
  children,
  testId,
  container,
  showOverlay = true,
  onOpenAutoFocus: _onOpenAutoFocus,
  ...props
}: SheetContentProps) {
  const { isOpen } = useSheet();
  const portalContainer = usePortalContainer();

  let animationPosition: { x?: string; y?: string; opacity: number };
  if (side === 'right') {
    animationPosition = { x: '100%', opacity: 0 };
  } else if (side === 'left') {
    animationPosition = { x: '-100%', opacity: 0 };
  } else if (side === 'top') {
    animationPosition = { y: '-100%', opacity: 0 };
  } else {
    animationPosition = { y: '100%', opacity: 0 };
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <SheetPortal container={container ?? portalContainer} data-slot="sheet-portal" keepMounted>
          {showOverlay ? (
            <SheetOverlay
              render={
                <motion.div
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  data-slot="sheet-overlay"
                  exit={{ opacity: 0, filter: 'blur(4px)' }}
                  initial={{ opacity: 0, filter: 'blur(4px)' }}
                  key="sheet-overlay"
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                />
              }
            />
          ) : null}
          <SheetPrimitive.Popup
            render={
              <motion.div
                animate={{ x: 0, y: 0, opacity: 1 }}
                className={cn(sheetVariants({ side, size }), className)}
                data-slot="sheet-content"
                data-testid={testId}
                exit={animationPosition}
                initial={animationPosition}
                key="sheet-content"
                transition={transition}
                {...props}
              >
                {children}
                <SheetPrimitive.Close
                  className="absolute top-5 right-5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary"
                  data-slot="sheet-close"
                >
                  <X className="h-7 w-7" />
                  <span className="sr-only">Close</span>
                </SheetPrimitive.Close>
              </motion.div>
            }
          />
        </SheetPortal>
      ) : null}
    </AnimatePresence>
  );
}

type SheetHeaderProps = React.ComponentProps<'div'>;

function SheetHeader({ className, ...props }: SheetHeaderProps) {
  return (
    <div
      className={cn('flex flex-col space-y-2 text-center sm:text-left', className)}
      data-slot="sheet-header"
      {...props}
    />
  );
}

type SheetFooterProps = React.ComponentProps<'div'>;

function SheetFooter({ className, ...props }: SheetFooterProps) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      data-slot="sheet-footer"
      {...props}
    />
  );
}

type SheetTitleProps = Omit<React.ComponentProps<typeof SheetPrimitive.Title>, 'className'> & {
  className?: string;
  level?: 1 | 2 | 3 | 4;
  asChild?: boolean;
};

function SheetTitle({ className, level = 2, ...props }: SheetTitleProps) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      render={
        <Heading className={className} level={level}>
          {props.children}
        </Heading>
      }
      {...props}
    />
  );
}

type SheetDescriptionProps = React.ComponentProps<typeof SheetPrimitive.Description> & { asChild?: boolean };

function SheetDescription({ className, children, asChild, ...props }: SheetDescriptionProps) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      render={renderDescription({
        asChild,
        children,
        className: typeof className === 'string' ? className : undefined,
        dataSlot: 'sheet-description',
      })}
      {...props}
    />
  );
}

export {
  useSheet,
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  type SheetProps,
  type SheetPortalProps,
  type SheetOverlayProps,
  type SheetTriggerProps,
  type SheetCloseProps,
  type SheetContentProps,
  type SheetHeaderProps,
  type SheetFooterProps,
  type SheetTitleProps,
  type SheetDescriptionProps,
};
