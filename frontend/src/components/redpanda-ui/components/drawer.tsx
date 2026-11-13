'use client';

import * as DrawerPrimitive from '@ui-sdk/react/drawer';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type SharedProps } from '../lib/utils';

type DrawerDirection = 'top' | 'right' | 'bottom' | 'left';
type DrawerProps = Omit<ComponentProps<typeof DrawerPrimitive.Drawer>, 'side'> &
  SharedProps & { direction?: DrawerDirection };
const DrawerContext = createContext<{ direction: DrawerDirection; modal: DrawerProps['modal'] }>({
  direction: 'bottom',
  modal: true,
});
function Drawer({ testId: _testId, direction = 'bottom', modal = true, ...props }: DrawerProps) {
  return (
    <DrawerContext.Provider value={{ direction, modal }}>
      <DrawerPrimitive.Drawer side={direction} modal={modal} {...props} />
    </DrawerContext.Provider>
  );
}
type DrawerTriggerProps = ComponentProps<typeof DrawerPrimitive.DrawerTrigger>;
type DrawerCloseProps = ComponentProps<typeof DrawerPrimitive.DrawerClose>;
const DrawerTrigger = DrawerPrimitive.DrawerTrigger;
const DrawerClose = DrawerPrimitive.DrawerClose;
type DrawerOverlayProps = ComponentProps<typeof DrawerPrimitive.DrawerBackdrop>;
function DrawerOverlay({ className, ...props }: DrawerOverlayProps) {
  return (
    <DrawerPrimitive.DrawerBackdrop
      className={cn('fixed inset-0 z-50 bg-modal-overlay-strong', className)}
      {...props}
    />
  );
}
type DrawerContentProps = Omit<ComponentProps<typeof DrawerPrimitive.DrawerContent>, 'children'> &
  SharedProps & { children?: ReactNode; showOverlay?: boolean; size?: 'md' | 'half' };
function DrawerContent({
  className,
  children,
  testId,
  container,
  showOverlay = true,
  size = 'md',
  ...props
}: DrawerContentProps) {
  const { direction, modal } = useContext(DrawerContext);
  const portalContainer = usePortalContainer();
  return (
    <>
      {showOverlay && modal === true ? <DrawerOverlay /> : null}
      <DrawerPrimitive.DrawerContent
        container={container ?? portalContainer}
        data-testid={testId}
        className={cn(
          'fixed z-50 flex max-h-[95dvh] flex-col border bg-background shadow-lg outline-none',
          direction === 'bottom' && 'inset-x-0 bottom-0 rounded-t-xl',
          direction === 'top' && 'inset-x-0 top-0 rounded-b-xl',
          direction === 'left' && 'inset-y-0 left-0 h-full',
          direction === 'right' && 'inset-y-0 right-0 h-full',
          (direction === 'left' || direction === 'right') &&
            (size === 'half' ? 'w-full sm:w-1/2' : 'w-3/4 sm:max-w-sm'),
          className
        )}
        {...props}
      >
        {direction === 'bottom' ? (
          <DrawerPrimitive.DrawerHandle
            className="mx-auto my-3 h-2 w-25 shrink-0 rounded-full bg-surface-subtle"
            aria-label="Resize drawer"
          />
        ) : null}
        {children}
      </DrawerPrimitive.DrawerContent>
    </>
  );
}
function DrawerHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-4', className)} data-slot="drawer-header" {...props} />;
}
function DrawerFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} data-slot="drawer-footer" {...props} />;
}
type DrawerTitleProps = ComponentProps<typeof DrawerPrimitive.DrawerTitle>;
function DrawerTitle({ className, ...props }: DrawerTitleProps) {
  return <DrawerPrimitive.DrawerTitle className={cn('text-heading-md text-foreground', className)} {...props} />;
}
type DrawerDescriptionProps = ComponentProps<typeof DrawerPrimitive.DrawerDescription>;
function DrawerDescription({ className, ...props }: DrawerDescriptionProps) {
  return <DrawerPrimitive.DrawerDescription className={cn('text-body text-subtle', className)} {...props} />;
}
export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
export type {
  DrawerProps,
  DrawerTriggerProps,
  DrawerCloseProps,
  DrawerOverlayProps,
  DrawerContentProps,
  DrawerDirection,
  DrawerTitleProps,
  DrawerDescriptionProps,
};
