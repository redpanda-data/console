import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn } from '../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive:
          'text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90',
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
        className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
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
          className,
        )}
        {...props}
      />
    );
  },
);

AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
