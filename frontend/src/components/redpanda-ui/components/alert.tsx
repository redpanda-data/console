import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn } from '../lib/utils';
import { textVariants } from './typography';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive:
          'text-destructive bg-destructive/10 [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90 !border-destructive/20 [&>href]:text-current',
        warning: 'bg-blue-50 text-blue-800 [&>svg]:text-current *:data-[slot=alert-description]:text-blue-800 !border-blue-200 [&>href]:text-current',
        success: 'bg-green-50 text-green-800 [&>svg]:text-current *:data-[slot=alert-description]:text-green-800 !border-green-200 [&>href]:text-current dark:bg-green-950/30 dark:text-green-300 dark:*:data-[slot=alert-description]:text-green-300 dark:!border-green-800/40',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & VariantProps<typeof alertVariants> & { testId?: string }
>(({ className, variant, testId, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="alert"
      data-testid={testId}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
});

Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { testId?: string }>(
  ({ className, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="alert-title"
        data-testid={testId}
        className={cn('col-start-2 line-clamp-1 min-h-4 flex items-center gap-2 mb-2 tracking-tight font-medium', textVariants({ variant: 'default' }), className)}
        {...props}
      />
    );
  },
);

AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { testId?: string }>(
  ({ className, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="alert-description"
        data-testid={testId}
        className={cn(
          'text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed',
          textVariants({ variant: 'small' }),
          className,
        )}
        {...props}
      />
    );
  },
);

AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
