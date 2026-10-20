'use client';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { type ButtonVariants, buttonVariants } from './button';
import { usePortalContainer } from '../lib/use-portal-container';
import { useScrollShadow } from '../lib/use-scroll-shadow';
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
        'data-[closed]:fade-out-0 data-[open]:fade-in-0 fixed inset-0 z-50 bg-modal-overlay fill-mode-forwards data-[closed]:animate-out data-[open]:animate-in',
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
        aria-modal="true"
        className={cn(
          'data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg border bg-background fill-mode-forwards shadow-lg duration-200 data-[closed]:animate-out data-[open]:animate-in sm:max-w-lg',
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
      className={cn(
        'flex shrink-0 flex-col gap-2 p-4 text-center sm:text-left [&:has(+[data-slot=alert-dialog-body])]:border-b',
        className
      )}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end [[data-slot=alert-dialog-body]+&]:border-t',
        className
      )}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

// Padding lives on the inner wrapper so scroll shadows can sit flush against the body edges.
const alertDialogBodyContentVariants = cva('', {
  variants: {
    padding: {
      none: '',
      sm: 'p-2',
      md: 'p-4',
      lg: 'p-6',
    },
    spacing: {
      none: '',
      sm: 'space-y-2',
      md: 'space-y-4',
      lg: 'space-y-6',
    },
  },
  defaultVariants: {
    padding: 'md',
    spacing: 'md',
  },
});

const alertDialogScrollShadow = 'pointer-events-none sticky z-10 h-0 transition-opacity motion-reduce:transition-none';
const alertDialogScrollShadowState = (visible: boolean) => (visible ? 'opacity-100' : 'opacity-0');

interface AlertDialogBodyProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof alertDialogBodyContentVariants> {
  /** Show fading top/bottom shadows when the body overflows. Defaults to `true`. */
  scrollShadow?: boolean;
}

function AlertDialogBody({
  className,
  padding,
  spacing,
  scrollShadow = true,
  children,
  ...props
}: AlertDialogBodyProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const edges = useScrollShadow(containerRef, scrollShadow);

  return (
    <div
      className={cn('relative min-h-0 flex-1 overflow-y-auto', className)}
      data-slot="alert-dialog-body"
      ref={containerRef}
      {...props}
    >
      {scrollShadow ? (
        <div aria-hidden className={cn(alertDialogScrollShadow, 'top-0', alertDialogScrollShadowState(edges.start))}>
          <div className="absolute inset-x-0 top-0 h-3 bg-linear-to-b from-black/[0.10] to-transparent" />
        </div>
      ) : null}
      <div className={alertDialogBodyContentVariants({ padding, spacing })}>{children}</div>
      {scrollShadow ? (
        <div aria-hidden className={cn(alertDialogScrollShadow, 'bottom-0', alertDialogScrollShadowState(edges.end))}>
          <div className="absolute inset-x-0 bottom-0 h-3 bg-linear-to-t from-black/[0.10] to-transparent" />
        </div>
      ) : null}
    </div>
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
      className={cn('text-body text-subtle', className)}
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

export type {
  AlertDialogActionProps,
  AlertDialogBodyProps,
  AlertDialogCancelProps,
  AlertDialogContentProps,
  AlertDialogRootProps,
  AlertDialogTriggerProps,
};
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
