import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import React from 'react';

import { buttonVariants } from './button';
import { usePortalContainer } from '../lib/use-portal-container';
import { asChildTrigger, narrowOpenChange, renderDescription, renderWithDataState } from '../lib/base-ui-compat';
import { cn, type FixedPositionContentProps, type SharedProps } from '../lib/utils';

type AlertDialogRootProps = Omit<React.ComponentProps<typeof AlertDialogPrimitive.Root>, 'onOpenChange'> &
  SharedProps & {
    onOpenChange?: (open: boolean) => void;
  };

function AlertDialog({ testId, onOpenChange, ...props }: AlertDialogRootProps) {
  return (
    <AlertDialogPrimitive.Root
      data-slot="alert-dialog"
      data-testid={testId}
      onOpenChange={narrowOpenChange(onOpenChange)}
      {...props}
    />
  );
}

type AlertDialogTriggerProps = React.ComponentProps<typeof AlertDialogPrimitive.Trigger> &
  SharedProps & {
    asChild?: boolean;
  };

function AlertDialogTrigger({ className, testId, ...props }: AlertDialogTriggerProps) {
  return (
    <AlertDialogPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="alert-dialog-trigger"
      data-testid={testId}
      {...asChildTrigger(props)}
    />
  );
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Backdrop>) {
  return (
    <AlertDialogPrimitive.Backdrop
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in',
        className
      )}
      data-slot="alert-dialog-overlay"
      render={renderWithDataState('div')}
      {...props}
    />
  );
}

type AlertDialogContentProps = React.ComponentProps<typeof AlertDialogPrimitive.Popup> &
  SharedProps &
  Pick<FixedPositionContentProps, 'container' | 'showOverlay' | 'onOpenAutoFocus'>;

function AlertDialogContent({
  className,
  testId,
  container,
  showOverlay = true,
  onOpenAutoFocus: _onOpenAutoFocus,
  ...props
}: AlertDialogContentProps) {
  const portalContainer = usePortalContainer();
  return (
    <AlertDialogPortal container={container ?? portalContainer}>
      {showOverlay ? <AlertDialogOverlay /> : null}
      <AlertDialogPrimitive.Popup
        className={cn(
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:max-w-lg',
          className
        )}
        data-slot="alert-dialog-content"
        data-testid={testId}
        render={renderWithDataState('div')}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('font-semibold text-lg', className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description> & { asChild?: boolean }) {
  // Render as <div> instead of the default <p> so it can safely contain block-level
  // children (Text, Input, List, etc.) without triggering validateDOMNesting warnings.
  // `asChild` is a Radix-compat passthrough — when set, the child element is used
  // as the render target (same semantics as Radix's asChild on Description).
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      render={renderDescription({
        asChild,
        children,
        className: typeof className === 'string' ? className : undefined,
      })}
      {...props}
    />
  );
}

type AlertDialogActionProps = React.ComponentProps<typeof AlertDialogPrimitive.Close> &
  SharedProps & {
    asChild?: boolean;
  };

function AlertDialogAction({ className, testId, ...props }: AlertDialogActionProps) {
  return (
    <AlertDialogPrimitive.Close
      className={cn(buttonVariants(), 'rounded-md', className)}
      data-testid={testId}
      {...asChildTrigger(props)}
    />
  );
}

type AlertDialogCancelProps = React.ComponentProps<typeof AlertDialogPrimitive.Close> &
  SharedProps & {
    asChild?: boolean;
  };

function AlertDialogCancel({ className, testId, ...props }: AlertDialogCancelProps) {
  return (
    <AlertDialogPrimitive.Close
      className={cn(buttonVariants({ variant: 'ghost' }), 'rounded-md', className)}
      data-testid={testId}
      {...asChildTrigger(props)}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
