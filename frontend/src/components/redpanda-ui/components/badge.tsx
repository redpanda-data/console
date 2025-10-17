import { cva, type VariantProps } from 'class-variance-authority';
import { Slot as SlotPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border  font-medium max-w-full whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden text-ellipsis truncate selection:bg-selected selection:text-selected-foreground',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        // Color variants
        green:
          'border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 [a&]:hover:bg-green-200 dark:[a&]:hover:bg-green-800',
        orange:
          'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300 [a&]:hover:bg-orange-200 dark:[a&]:hover:bg-orange-800',
        blue: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 [a&]:hover:bg-blue-200 dark:[a&]:hover:bg-blue-800',
        purple:
          'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 [a&]:hover:bg-purple-200 dark:[a&]:hover:bg-purple-800',
        indigo:
          'border-transparent bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300 [a&]:hover:bg-indigo-200 dark:[a&]:hover:bg-indigo-800',
        yellow:
          'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 [a&]:hover:bg-yellow-200 dark:[a&]:hover:bg-yellow-800',
        cyan: 'border-transparent bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300 [a&]:hover:bg-cyan-200 dark:[a&]:hover:bg-cyan-800',
        teal: 'border-transparent bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300 [a&]:hover:bg-teal-200 dark:[a&]:hover:bg-teal-800',
        rose: 'border-transparent bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300 [a&]:hover:bg-rose-200 dark:[a&]:hover:bg-rose-800',
        emerald:
          'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300 [a&]:hover:bg-emerald-200 dark:[a&]:hover:bg-emerald-800',
        amber:
          'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 [a&]:hover:bg-amber-200 dark:[a&]:hover:bg-amber-800',
        red: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 [a&]:hover:bg-red-200 dark:[a&]:hover:bg-red-800',
        gray: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300 [a&]:hover:bg-gray-200 dark:[a&]:hover:bg-gray-800',
      },
      size: {
        default: 'px-2 py-0.5 text-xs',
        sm: 'px-1 py-0.25 text-[10px]',
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
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
}: React.ComponentProps<'span'> & {
  asChild?: boolean;
  testId?: string;
  icon?: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
}) {
  const Comp = asChild ? SlotPrimitive.Slot : 'span';

  return (
    <Comp data-slot="badge" data-testid={testId} className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon}
      {children && <span className="truncate">{children}</span>}
    </Comp>
  );
}

export { Badge, badgeVariants };
