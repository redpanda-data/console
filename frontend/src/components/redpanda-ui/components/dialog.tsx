import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import React from 'react';

import { Button } from './button';
import { usePortalContainer } from '../lib/use-portal-container';
import {
  asChildTrigger,
  narrowOpenChange,
  renderDescription,
  renderWithDataState,
  warnDeprecatedProp,
} from '../lib/base-ui-compat';
import { cn, type FixedPositionContentProps, type SharedProps } from '../lib/utils';

type DialogRootProps = Omit<React.ComponentProps<typeof DialogPrimitive.Root>, 'onOpenChange'> &
  SharedProps & {
    onOpenChange?: (open: boolean) => void;
  };

function Dialog({ testId, onOpenChange, ...props }: DialogRootProps) {
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      data-testid={testId}
      onOpenChange={narrowOpenChange(onOpenChange)}
      {...props}
    />
  );
}

type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger> & {
  asChild?: boolean;
};

function DialogTrigger({ className, ...props }: DialogTriggerProps) {
  return (
    <DialogPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="dialog-trigger"
      {...asChildTrigger(props)}
    />
  );
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close> & {
  asChild?: boolean;
};

function DialogClose({ ...props }: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...asChildTrigger(props)} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      // fill-mode-forwards keeps the final keyframe (opacity 0) applied until
      // Base UI unmounts the element; without it the backdrop snaps back to
      // its natural opacity for one frame after the exit animation ends.
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 fill-mode-forwards backdrop-blur-xs data-[state=closed]:animate-out data-[state=open]:animate-in',
        className
      )}
      data-slot="dialog-overlay"
      render={renderWithDataState('div')}
      {...props}
    />
  );
}

// Base layout: flex column with capped height so a long DialogBody scrolls
// while DialogHeader / DialogFooter stay pinned. Padding lives on the
// sub-parts so their borders can extend edge-to-edge.
const dialogContentVariants = cva(
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xl border bg-background fill-mode-forwards shadow-lg duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in',
  {
    variants: {
      size: {
        sm: 'sm:max-w-sm',
        md: 'sm:max-w-lg',
        lg: 'sm:max-w-2xl',
        xl: 'sm:max-w-4xl',
        full: 'sm:max-w-[90vw]',
      },
      variant: {
        standard: '',
        centered: 'text-center',
        destructive: 'border-destructive/50',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'standard',
    },
  }
);

interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Popup>,
    VariantProps<typeof dialogContentVariants>,
    SharedProps,
    Pick<FixedPositionContentProps, 'container' | 'showOverlay' | 'onOpenAutoFocus'> {
  showCloseButton?: boolean;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  showOverlay = true,
  size,
  variant,
  testId,
  container,
  onOpenAutoFocus,
  ...props
}: DialogContentProps) {
  warnDeprecatedProp(
    'DialogContent',
    'onOpenAutoFocus',
    onOpenAutoFocus,
    'Use `initialFocus` on Base UI `Dialog.Popup` instead.'
  );
  const portalContainer = usePortalContainer();
  return (
    <DialogPortal container={container ?? portalContainer}>
      {showOverlay ? <DialogOverlay /> : null}
      <DialogPrimitive.Popup
        className={cn(dialogContentVariants({ size, variant }), className)}
        data-slot="dialog-content"
        data-testid={testId}
        render={renderWithDataState('div')}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            render={
              <Button
                aria-label="Close"
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                size="icon-sm"
                variant="ghost"
              >
                <X />
              </Button>
            }
          />
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

// `:has(+[data-slot=dialog-body])` only draws the bottom divider when a
// DialogBody follows — keeps header-only and header+footer dialogs clean.
const dialogHeaderVariants = cva('flex shrink-0 flex-col p-4 [&:has(+[data-slot=dialog-body])]:border-b', {
  variants: {
    align: {
      left: 'text-left',
      center: 'text-center',
      responsive: 'text-center sm:text-left',
    },
    spacing: {
      tight: 'space-y-1',
      normal: 'space-y-1.5',
      loose: 'space-y-2',
    },
  },
  defaultVariants: {
    align: 'responsive',
    spacing: 'normal',
  },
});

interface DialogHeaderProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogHeaderVariants> {}

function DialogHeader({ className, align, spacing, ...props }: DialogHeaderProps) {
  return (
    <div className={cn(dialogHeaderVariants({ align, spacing }), className)} data-slot="dialog-header" {...props} />
  );
}

// Matches DialogHeader: only draw the top divider when a DialogBody is the
// preceding sibling, so footer-only and header+footer dialogs stay clean.
const dialogFooterVariants = cva('flex shrink-0 p-4 [[data-slot=dialog-body]+&]:border-t', {
  variants: {
    direction: {
      column: 'flex-col',
      row: 'flex-row items-center',
      responsive: 'flex-col-reverse sm:flex-row sm:items-center',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end sm:justify-end',
      between: 'justify-between',
    },
    gap: {
      sm: 'gap-1',
      md: 'gap-2',
      lg: 'gap-4',
    },
  },
  defaultVariants: {
    direction: 'responsive',
    justify: 'end',
    gap: 'md',
  },
});

interface DialogFooterProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogFooterVariants> {}

function DialogFooter({ className, direction, justify, gap, ...props }: DialogFooterProps) {
  return (
    <div
      className={cn(dialogFooterVariants({ direction, justify, gap }), className)}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-semibold text-lg leading-none tracking-tight', className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description> & { asChild?: boolean }) {
  // Render as <div> instead of the default <p> so it can safely contain block-level
  // children (Text, Input, List, etc.) without triggering validateDOMNesting warnings.
  // `asChild` is a Radix-compat passthrough — when set, the child element is used
  // as the render target (same semantics as Radix's asChild on Description).
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      render={renderDescription({
        asChild,
        children,
        className: typeof className === 'string' ? className : undefined,
      })}
      {...props}
    />
  );
}

// Content layout helpers. DialogBody is the scrollable middle region inside
// DialogContent — min-h-0 lets it shrink below its natural height so
// overflow-y-auto actually scrolls when the content is tall.
const dialogBodyVariants = cva('min-h-0 flex-1 overflow-y-auto p-4', {
  variants: {
    spacing: {
      none: '',
      sm: 'space-y-2',
      md: 'space-y-4',
      lg: 'space-y-6',
    },
  },
  defaultVariants: {
    spacing: 'md',
  },
});

interface DialogBodyProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogBodyVariants> {}

function DialogBody({ className, spacing, ...props }: DialogBodyProps) {
  return <div className={cn(dialogBodyVariants({ spacing }), className)} data-slot="dialog-body" {...props} />;
}

const dialogFieldVariants = cva('flex flex-col', {
  variants: {
    spacing: {
      tight: 'space-y-1',
      normal: 'space-y-1.5',
      loose: 'space-y-2',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

interface DialogFieldProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogFieldVariants> {}

function DialogField({ className, spacing, ...props }: DialogFieldProps) {
  return <div className={cn(dialogFieldVariants({ spacing }), className)} {...props} />;
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogField,
};
