import { cva, type VariantProps } from 'class-variance-authority';
import { Slot as SlotPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex max-w-full shrink-0 items-center justify-center overflow-hidden truncate text-ellipsis whitespace-nowrap rounded-md border font-medium transition-[color,box-shadow] selection:bg-selected selection:text-selected-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        // === NEUTRAL (Grey - semantic tokens) ===
        neutral:
          '!border-transparent bg-background-inverse-subtle text-inverse [a&]:hover:bg-background-inverse-subtle-hover',
        'neutral-inverted': '!border-transparent bg-surface-subtle [a&]:hover:bg-background-subtle-hover',
        'neutral-outline': '!border-outline-inverse border [a&]:hover:bg-background-subtle-hover',

        // === SIMPLE (Light grey - semantic tokens) ===
        simple: 'text-secondary [a&]:hover:bg-background-subtle-hover',
        'simple-inverted': '!border-transparent text-secondary [a&]:hover:bg-background-subtle-hover',
        'simple-outline': '!border-outline-inverse border text-secondary [a&]:hover:bg-background-subtle-hover',

        // === INFO (Blue - semantic tokens) ===
        info: '!border-transparent bg-surface-informative text-inverse [a&]:hover:bg-surface-informative-hover',
        'info-inverted':
          '!border-transparent bg-surface-informative-subtle text-info [a&]:hover:bg-surface-informative-subtle-hover',
        'info-outline': '!border-outline-informative bg-transparent text-info [a&]:hover:bg-surface-informative-subtle',

        // === ACCENT (Brand Red - uses theme brand tokens) ===
        accent: '!border-transparent bg-brand text-brand-foreground [a&]:hover:bg-surface-brand-hover',
        'accent-inverted': '!border-transparent bg-background-brand-subtle text-brand [a&]:hover:bg-brand-alpha-default',
        'accent-outline': '!border-outline-brand bg-transparent text-brand [a&]:hover:bg-brand-alpha-subtle',

        // === SUCCESS (Green - semantic tokens) ===
        success: '!border-transparent bg-surface-success text-inverse [a&]:hover:bg-surface-success-hover',
        'success-inverted':
          '!border-transparent bg-surface-success-subtle text-success [a&]:hover:bg-surface-success-subtle-hover',
        'success-outline': '!border-outline-success bg-transparent text-success [a&]:hover:bg-surface-success-subtle',

        // === WARNING (Yellow/Orange - semantic tokens) ===
        warning: '!border-transparent bg-surface-warning text-inverse [a&]:hover:bg-surface-warning-hover',
        'warning-inverted': '!border-transparent bg-background-warning-subtle text-warning [a&]:hover:bg-warning-subtle',
        'warning-outline': '!border-outline-warning bg-transparent text-warning [a&]:hover:bg-background-warning-subtle',

        // === DISABLED (Muted - semantic tokens) ===
        disabled: 'cursor-not-allowed !border-transparent bg-background-disabled text-disabled',
        'disabled-inverted': 'cursor-not-allowed !border-transparent bg-surface-subtle text-disabled',
        'disabled-outline': 'cursor-not-allowed !border-border-strong bg-transparent text-disabled',

        // === DESTRUCTIVE/ERROR (Red - semantic tokens) ===
        destructive:
          '!border-transparent bg-surface-error text-inverse focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-surface-error-hover',
        'destructive-inverted':
          '!border-transparent bg-background-error-subtle text-destructive [a&]:hover:bg-destructive-subtle',
        'destructive-outline':
          '!border-outline-error bg-transparent text-destructive [a&]:hover:bg-background-error-subtle',

        // === SECONDARY (Dark Blue) ===
        secondary: '!border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        'secondary-inverted': '!border-transparent bg-secondary/10 text-secondary [a&]:hover:bg-secondary/20',
        'secondary-outline': '!border-secondary text-secondary [a&]:hover:bg-secondary/10',

        // === PRIMARY (Indigo) ===
        primary: '!border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        'primary-inverted': '!border-transparent bg-primary/10 text-primary [a&]:hover:bg-primary/20',
        'primary-outline': '!border-primary text-primary [a&]:hover:bg-primary/10',

        // === OUTLINE (generic) ===
        outline: '!border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
      size: {
        // Small: 20px height (from Figma)
        sm: 'h-5 gap-1 px-1.5 py-0 text-[11px] [&>svg]:size-3',
        // Medium: 24px height (from Figma)
        md: 'h-6 gap-1 px-2 py-0 text-xs [&>svg]:size-3.5',
        // Large: 32px height (from Figma)
        lg: 'h-8 gap-1.5 px-3 py-0 text-sm [&>svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  }
);

export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
export type BadgeSize = VariantProps<typeof badgeVariants>['size'];

function Badge({
  className,
  variant,
  asChild = false,
  testId,
  icon,
  children,
  size,
  ...props
}: React.ComponentProps<'span'> &
  SharedProps & {
    asChild?: boolean;
    icon?: React.ReactNode;
    variant?: BadgeVariant;
    size?: BadgeSize;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : 'span';

  return (
    <Comp className={cn(badgeVariants({ variant, size }), className)} data-slot="badge" data-testid={testId} {...props}>
      {icon}
      {children ? <span className="truncate">{children}</span> : null}
    </Comp>
  );
}

export { Badge, badgeVariants };
