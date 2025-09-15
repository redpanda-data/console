import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

function Dialog({
  testId,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & {
  testId?: string;
}) {
  return <DialogPrimitive.Root data-slot="dialog" data-testid={testId} {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80',
        className,
      )}
      {...props}
    />
  );
}

const dialogContentVariants = cva(
  'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] border shadow-lg duration-200 rounded-xl',
  {
    variants: {
      size: {
        sm: 'gap-3 p-4 sm:max-w-sm',
        md: 'gap-4 p-6 sm:max-w-lg',
        lg: 'gap-5 p-8 sm:max-w-2xl',
        xl: 'gap-6 p-10 sm:max-w-4xl',
        full: 'gap-4 p-6 sm:max-w-[90vw]',
      },
      variant: {
        default: '',
        centered: 'text-center',
        destructive: 'border-destructive/50',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  },
);

interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  showCloseButton?: boolean;
  testId?: string;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  size,
  variant,
  testId,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-testid={testId}
        className={cn(dialogContentVariants({ size, variant }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

const dialogHeaderVariants = cva('flex flex-col', {
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
    <div data-slot="dialog-header" className={cn(dialogHeaderVariants({ align, spacing }), className)} {...props} />
  );
}

const dialogFooterVariants = cva('flex', {
  variants: {
    direction: {
      column: 'flex-col',
      row: 'flex-row',
      responsive: 'flex-col-reverse sm:flex-row',
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
      data-slot="dialog-footer"
      className={cn(dialogFooterVariants({ direction, justify, gap }), className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

// Content layout helpers
const dialogBodyVariants = cva('', {
  variants: {
    spacing: {
      none: '',
      sm: 'space-y-2',
      md: 'space-y-4',
      lg: 'space-y-6',
    },
    padding: {
      none: '',
      sm: 'py-2',
      md: 'py-4',
      lg: 'py-6',
    },
  },
  defaultVariants: {
    spacing: 'md',
    padding: 'md',
  },
});

interface DialogBodyProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogBodyVariants> {}

function DialogBody({ className, spacing, padding, ...props }: DialogBodyProps) {
  return <div data-slot="dialog-body" className={cn(dialogBodyVariants({ spacing, padding }), className)} {...props} />;
}

// Form-specific layout helpers
const dialogFormVariants = cva('grid gap-4', {
  variants: {
    spacing: {
      tight: 'gap-2',
      normal: 'gap-4',
      loose: 'gap-6',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

interface DialogFormProps extends React.ComponentProps<'form'>, VariantProps<typeof dialogFormVariants> {}

function DialogForm({ className, spacing, ...props }: DialogFormProps) {
  return <form className={cn(dialogFormVariants({ spacing }), className)} {...props} />;
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
  DialogForm,
  DialogField,
};
