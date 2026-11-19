// Copyright 2026 Redpanda Data, Inc.

import { cva, type VariantProps } from 'class-variance-authority';
import { InfoIcon } from 'lucide-react';
import type React from 'react';
import { cn, type SharedProps } from '../lib/utils';

const alertVariants = cva(
  // Body text is neutral high-contrast; the tone lives in the surface, border, and icon.
  // NOTE: the dark-mode palette is provisional and not yet contrast-tested.
  'relative grid w-full grid-cols-[minmax(0,1fr)] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-body text-strong has-[>[data-slot=alert-action]]:grid-cols-[minmax(0,1fr)_auto] has-[>[data-slot=alert-action]]:gap-x-3 has-[>svg]:grid-cols-[calc(var(--spacing)*4)_minmax(0,1fr)] has-[>svg]:gap-x-3 has-[>svg]:has-[>[data-slot=alert-action]]:grid-cols-[calc(var(--spacing)*4)_minmax(0,1fr)_auto] *:data-[slot=alert-description]:text-strong [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    // `!border-*` overrides the global `*` border-color set in the base layer.
    variants: {
      variant: {
        informative: '!border-informative-line bg-informative-wash [&>svg]:text-informative',
        success: '!border-success-line bg-success-wash [&>svg]:text-success',
        warning: '!border-warning-line bg-warning-wash [&>svg]:text-warning',
        destructive: '!border-destructive-line bg-destructive-wash [&>svg]:text-destructive',
        // A toneless notice: for banners that inform without carrying a status.
        neutral: '!border-border bg-secondary-wash [&>svg]:text-subtle',
      },
    },
    defaultVariants: {
      variant: 'informative',
    },
  }
);

function Alert({
  className,
  variant,
  testId,
  icon,
  children,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof alertVariants> &
  SharedProps & { icon?: React.ReactNode | undefined }) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      data-testid={testId}
      role="alert"
      {...props}
    >
      {icon === undefined ? <InfoIcon /> : icon}
      {children}
    </div>
  );
}

/**
 * Links in both slots take `link-inline` and nothing else: the alert's ink is already the `strong`
 * role, so a hover that recoloured it could only go quieter — the `foreground` role off `strong`
 * loses contrast in both themes. Firming the reserved underline from 45% currentcolor to full is
 * the step, which is what `link-inline` is for, and `transition-colors` covers
 * `text-decoration-color` so it fades rather than snapping.
 *
 * Class names stay out of this comment on purpose: `scan-palette-usage.ts` greps raw source, so a
 * utility named in prose counts as a call site.
 */
function AlertTitle({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn(
        'col-start-1 line-clamp-1 min-h-4 text-label [&_a]:link-inline [&_a]:transition-colors [&_a]:motion-reduce:transition-none [[data-slot=alert]:has(>svg)>&]:col-start-2',
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
        // No ink of its own: the root sets the `strong` role on this slot with a `*:` variant,
        // which outranks anything set here — body text in an alert is high-contrast, and the tone
        // lives in the surface, border and icon.
        'col-start-1 grid justify-items-start gap-1 text-body [&_a]:link-inline [&_a]:transition-colors [&_a]:motion-reduce:transition-none [&_p]:leading-relaxed [[data-slot=alert]:has(>svg)>&]:col-start-2',
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
    <div
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end [[data-slot=alert]:has(>svg)>&]:col-start-3',
        className
      )}
      data-slot="alert-action"
      data-testid={testId}
      {...props}
    />
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
