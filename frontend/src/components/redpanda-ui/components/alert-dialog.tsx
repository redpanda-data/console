'use client';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import type React from 'react';

import { type ButtonVariants, buttonVariants } from './button';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type FixedPositionContentProps, type SharedProps } from '../lib/utils';

type AlertDialogRootProps = AlertDialogPrimitive.Root.Props & SharedProps;

function AlertDialog({ testId, ...props }: AlertDialogRootProps) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" data-testid={testId} {...props} />;
}

type AlertDialogTriggerProps = AlertDialogPrimitive.Trigger.Props & SharedProps;

function AlertDialogTrigger({ className, testId, ...props }: AlertDialogTriggerProps) {
  return (
    <AlertDialogPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="alert-dialog-trigger"
      data-testid={testId}
      {...props}
    />
  );
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      className={cn(
        // fill-mode-forwards holds the exit keyframe until Base UI unmounts (else a one-frame flash).
        'data-[closed]:fade-out-0 data-[open]:fade-in-0 fixed inset-0 z-50 bg-black/50 fill-mode-forwards data-[closed]:animate-out data-[open]:animate-in',
        className
      )}
      data-slot="alert-dialog-overlay"
      {...props}
    />
  );
}

type AlertDialogContentProps = AlertDialogPrimitive.Popup.Props &
  SharedProps &
  Pick<FixedPositionContentProps, 'container' | 'showOverlay'>;

function AlertDialogContent({ className, testId, container, showOverlay = true, ...props }: AlertDialogContentProps) {
  const portalContainer = usePortalContainer();
  return (
    <AlertDialogPortal container={container ?? portalContainer}>
      {showOverlay ? <AlertDialogOverlay /> : null}
      <AlertDialogPrimitive.Popup
        className={cn(
          'data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-hidden rounded-lg border bg-background fill-mode-forwards p-6 shadow-lg duration-200 data-[closed]:animate-out data-[open]:animate-in sm:max-w-lg',
          className
        )}
        data-slot="alert-dialog-content"
        data-testid={testId}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex shrink-0 flex-col gap-2 text-center sm:text-left', className)}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('text-heading-md', className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('text-body text-muted-foreground', className)}
      data-slot="alert-dialog-description"
      // Render as <div> (not the default <p>) so block-level children don't trigger validateDOMNesting.
      render={<div />}
      {...props}
    />
  );
}

type AlertDialogActionProps = AlertDialogPrimitive.Close.Props & SharedProps & Pick<ButtonVariants, 'variant' | 'size'>;

function AlertDialogAction({ className, testId, variant, size, ...props }: AlertDialogActionProps) {
  return (
    <AlertDialogPrimitive.Close
      className={cn(buttonVariants({ variant, size }), 'rounded-md', className)}
      data-slot="alert-dialog-action"
      data-testid={testId}
      {...props}
    />
  );
}

type AlertDialogCancelProps = AlertDialogPrimitive.Close.Props & SharedProps & Pick<ButtonVariants, 'variant' | 'size'>;

function AlertDialogCancel({ className, testId, variant = 'outline', size, ...props }: AlertDialogCancelProps) {
  return (
    <AlertDialogPrimitive.Close
      className={cn(buttonVariants({ variant, size }), 'rounded-md', className)}
      data-slot="alert-dialog-cancel"
      data-testid={testId}
      {...props}
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

export type {
  AlertDialogRootProps,
  AlertDialogTriggerProps,
  AlertDialogContentProps,
  AlertDialogActionProps,
  AlertDialogCancelProps,
};
