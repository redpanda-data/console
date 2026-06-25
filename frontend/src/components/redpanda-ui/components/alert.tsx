import { cva, type VariantProps } from 'class-variance-authority';
import { InfoIcon } from 'lucide-react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        info: 'bg-card text-card-foreground',
        destructive:
          '!border-destructive/20 bg-destructive/10 text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current',
        // `warning` is a neutral informational alert built from shadcn base
        // tokens only (bg-card + the shared border), matching shadcn's `default`
        // variant. It carries no custom color token, so it is inherently
        // dark-safe. The old value was a light-only raw-blue palette that glared
        // as a near-white blob in dark mode. Meaning is conveyed by the caller's
        // icon/content; for a colored status use `destructive` or the Badge
        // variants rather than tinting the Alert surface.
        warning: 'bg-card text-card-foreground',
        success:
          '!border-green-200 dark:!border-green-800/40 bg-green-50 text-green-800 *:data-[slot=alert-description]:text-green-800 dark:bg-green-950/30 dark:text-green-300 dark:*:data-[slot=alert-description]:text-green-300 [&>svg]:text-current',
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
        'col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
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
        'col-start-2 grid justify-items-start gap-1 text-muted-foreground text-sm [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p]:leading-relaxed',
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
