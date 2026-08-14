import { cva, type VariantProps } from 'class-variance-authority';
import { InfoIcon } from 'lucide-react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const alertVariants = cva(
  // Body text is neutral high-contrast; the tone lives in the surface, border, and icon.
  // NOTE: the dark-mode palette is provisional and not yet contrast-tested.
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-grey-900 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 *:data-[slot=alert-description]:text-grey-900 dark:text-grey-50 dark:*:data-[slot=alert-description]:text-grey-50 [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    // `!border-*` overrides the global `*` border-color set in the base layer.
    variants: {
      variant: {
        info: '!border-outline-informative bg-background-informative-subtle [&>svg]:text-informative',
        success: '!border-outline-success bg-background-success-subtle [&>svg]:text-success',
        warning: '!border-outline-warning bg-background-warning-subtle [&>svg]:text-warning',
        destructive: '!border-outline-error bg-background-error-subtle [&>svg]:text-destructive',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
);

function Alert({
  className,
  variant,
  testId,
  icon = <InfoIcon />,
  children,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants> & SharedProps & { icon?: React.ReactNode }) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      data-testid={testId}
      role="alert"
      {...props}
    >
      {icon}
      {children}
    </div>
  );
}

function AlertTitle({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 text-label [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
        className
      )}
      data-slot="alert-title"
      data-testid={testId}
      {...props}
    />
  );
}

function AlertDescription({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-body text-muted-foreground [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p]:leading-relaxed',
        className
      )}
      data-slot="alert-description"
      data-testid={testId}
      {...props}
    />
  );
}

function AlertAction({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div className={cn('absolute top-2 right-2', className)} data-slot="alert-action" data-testid={testId} {...props} />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
