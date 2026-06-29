'use client';

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type React from 'react';

import { Heading } from './typography';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type FixedPositionContentProps, type SharedProps } from '../lib/utils';

type SheetProps = SheetPrimitive.Root.Props & SharedProps;

function Sheet({ testId, ...props }: SheetProps) {
  return <SheetPrimitive.Root data-slot="sheet" data-testid={testId} {...props} />;
}

type SheetTriggerProps = SheetPrimitive.Trigger.Props & SharedProps;

function SheetTrigger({ className, testId, ...props }: SheetTriggerProps) {
  return (
    <SheetPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="sheet-trigger"
      data-testid={testId}
      {...props}
    />
  );
}

type SheetCloseProps = SheetPrimitive.Close.Props;

function SheetClose({ className, ...props }: SheetCloseProps) {
  return <SheetPrimitive.Close className={cn('cursor-pointer', className)} data-slot="sheet-close" {...props} />;
}

type SheetPortalProps = SheetPrimitive.Portal.Props;

function SheetPortal(props: SheetPortalProps) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

type SheetOverlayProps = SheetPrimitive.Backdrop.Props;

function SheetOverlay({ className, ...props }: SheetOverlayProps) {
  return (
    <SheetPrimitive.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-black/50 transition-opacity duration-500 ease-in-out data-[ending-style]:duration-300',
        'data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
        className
      )}
      data-slot="sheet-overlay"
      {...props}
    />
  );
}

const sheetVariants = cva(
  cn(
    'fixed z-50 gap-4 bg-background px-10 py-8 shadow-lg',
    // shadcn's asymmetric slide timing: 500ms in / 300ms out, full off-screen travel.
    'transition-transform duration-500 ease-in-out data-[ending-style]:duration-300 motion-reduce:transition-none',
    'data-[side=right]:data-[ending-style]:translate-x-full data-[side=right]:data-[starting-style]:translate-x-full',
    'data-[side=left]:data-[ending-style]:-translate-x-full data-[side=left]:data-[starting-style]:-translate-x-full',
    'data-[side=top]:data-[ending-style]:-translate-y-full data-[side=top]:data-[starting-style]:-translate-y-full',
    'data-[side=bottom]:data-[ending-style]:translate-y-full data-[side=bottom]:data-[starting-style]:translate-y-full'
  ),
  {
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
  }
);

type SheetContentProps = SheetPrimitive.Popup.Props &
  VariantProps<typeof sheetVariants> &
  SharedProps &
  Pick<FixedPositionContentProps, 'container' | 'showOverlay'> & {
    showCloseButton?: boolean;
  };

function SheetContent({
  side = 'right',
  size = 'xl',
  className,
  children,
  testId,
  container,
  showOverlay = true,
  showCloseButton = true,
  ...props
}: SheetContentProps) {
  const portalContainer = usePortalContainer();

  return (
    <SheetPrimitive.Portal container={container ?? portalContainer} data-slot="sheet-portal">
      {showOverlay ? <SheetOverlay /> : null}
      <SheetPrimitive.Popup
        className={cn(sheetVariants({ side, size }), className)}
        data-side={side}
        data-slot="sheet-content"
        data-testid={testId}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close
            className="absolute top-5 right-5 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
            data-slot="sheet-close"
          >
            <X className="h-7 w-7" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

type SheetHeaderProps = React.ComponentProps<'div'>;

function SheetHeader({ className, ...props }: SheetHeaderProps) {
  return <div className={cn('flex flex-col gap-1.5', className)} data-slot="sheet-header" {...props} />;
}

type SheetFooterProps = React.ComponentProps<'div'>;

function SheetFooter({ className, ...props }: SheetFooterProps) {
  return <div className={cn('mt-auto flex flex-col gap-2', className)} data-slot="sheet-footer" {...props} />;
}

type SheetTitleProps = Omit<SheetPrimitive.Title.Props, 'className'> & {
  className?: string;
  level?: 1 | 2 | 3 | 4;
};

function SheetTitle({ className, level = 2, children, ...props }: SheetTitleProps) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      render={
        <Heading className={className} level={level}>
          {children}
        </Heading>
      }
      {...props}
    />
  );
}

type SheetDescriptionProps = SheetPrimitive.Description.Props;

function SheetDescription({ className, ...props }: SheetDescriptionProps) {
  return (
    <SheetPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      data-slot="sheet-description"
      {...props}
    />
  );
}

export {
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
