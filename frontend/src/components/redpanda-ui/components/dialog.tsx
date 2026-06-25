'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import React from 'react';

import { Button } from './button';
import { useAnimatedAutoHeight } from '../lib/use-animated-auto-height';
import { useMediaQuery } from '../lib/use-media-query';
import { usePortalContainer } from '../lib/use-portal-container';
import { useScrollShadow } from '../lib/use-scroll-shadow';
import { cn, type SharedProps } from '../lib/utils';

type DialogRootProps = DialogPrimitive.Root.Props & SharedProps;

function Dialog({ testId, ...props }: DialogRootProps) {
  return <DialogPrimitive.Root data-slot="dialog" data-testid={testId} {...props} />;
}

function DialogTrigger({ className, ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger className={cn('cursor-pointer', className)} data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ className, ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close className={cn('cursor-pointer', className)} data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-200 ease-out',
        'data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
        className
      )}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// `height` is intentionally omitted from the transition list — useAnimatedAutoHeight drives it.
const dialogContentVariants = cva(
  'fixed top-[50%] left-[50%] z-50 flex w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xl border bg-background shadow-lg transition-[opacity,transform,max-height,min-height] duration-200 ease-out data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
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
      height: {
        auto: 'max-h-[85vh]',
        sm: 'h-[min(85vh,400px)]',
        md: 'h-[min(85vh,560px)]',
        lg: 'h-[min(85vh,720px)]',
        xl: 'h-[min(85vh,880px)]',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'standard',
      height: 'auto',
    },
  }
);

interface DialogContentProps
  extends DialogPrimitive.Popup.Props,
    VariantProps<typeof dialogContentVariants>,
    SharedProps {
  /** Container element for inline rendering (no portal to body). */
  container?: HTMLElement;
  /** When false, hides the overlay/backdrop. Defaults to `true`. */
  showOverlay?: boolean;
  showCloseButton?: boolean;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  showOverlay = true,
  size,
  variant,
  height,
  testId,
  container,
  ...props
}: DialogContentProps) {
  const portalContainer = usePortalContainer();
  // Skip the JS height animation under reduced motion (height snaps instantly).
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const isAutoHeight = !height || height === 'auto';
  const setPopupRef = useAnimatedAutoHeight<HTMLDivElement>(isAutoHeight && !prefersReducedMotion);
  return (
    <DialogPortal container={container ?? portalContainer}>
      {showOverlay ? <DialogOverlay /> : null}
      <DialogPrimitive.Popup
        className={cn(dialogContentVariants({ size, variant, height }), className)}
        data-slot="dialog-content"
        data-testid={testId}
        ref={setPopupRef}
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

interface DialogFooterProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogFooterVariants> {
  /** Render a built-in "Close" button that dismisses the dialog. Defaults to `false`. */
  showCloseButton?: boolean;
}

function DialogFooter({
  className,
  direction,
  justify,
  gap,
  showCloseButton = false,
  children,
  ...props
}: DialogFooterProps) {
  return (
    <div
      className={cn(dialogFooterVariants({ direction, justify, gap }), className)}
      data-slot="dialog-footer"
      {...props}
    >
      {children}
      {showCloseButton ? <DialogPrimitive.Close render={<Button variant="outline">Close</Button>} /> : null}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn('font-semibold text-lg leading-none tracking-tight', className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      data-slot="dialog-description"
      // Render as <div> (not Base UI's default <p>) so block-level children don't trigger validateDOMNesting.
      render={<div />}
      {...props}
    />
  );
}

// Padding lives on the inner wrapper so scroll shadows can sit flush against the body edges.
const dialogBodyContainerVariants = cva('relative min-h-0 flex-1 overflow-y-auto');

const dialogBodyContentVariants = cva('', {
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

interface DialogBodyProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogBodyContentVariants> {
  /** Show fading top/bottom shadows when the body overflows. Defaults to `true`. */
  scrollShadow?: boolean;
}

function DialogBody({ className, padding, spacing, scrollShadow = true, children, style, ...props }: DialogBodyProps) {
  const { containerRef, topRef, bottomRef, edges } = useScrollShadow<HTMLDivElement>(scrollShadow);

  return (
    <div
      className={cn(dialogBodyContainerVariants(), className)}
      data-slot="dialog-body"
      ref={containerRef}
      style={style}
      {...props}
    >
      {scrollShadow ? (
        <>
          <div aria-hidden className="h-px shrink-0" ref={topRef} />
          <div
            aria-hidden
            className={cn(
              'pointer-events-none sticky top-0 z-10 h-0 transition-opacity duration-150',
              edges.top ? 'opacity-100' : 'opacity-0'
            )}
          >
            <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-black/[0.10] to-transparent" />
          </div>
        </>
      ) : null}
      <div className={cn(dialogBodyContentVariants({ padding, spacing }))}>{children}</div>
      {scrollShadow ? (
        <>
          <div
            aria-hidden
            className={cn(
              'pointer-events-none sticky bottom-0 z-10 h-0 transition-opacity duration-150',
              edges.bottom ? 'opacity-100' : 'opacity-0'
            )}
          >
            <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black/[0.10] to-transparent" />
          </div>
          <div aria-hidden className="h-px shrink-0" ref={bottomRef} />
        </>
      ) : null}
    </div>
  );
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
