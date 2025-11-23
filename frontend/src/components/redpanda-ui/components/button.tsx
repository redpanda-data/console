'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Slot as SlotPrimitive } from 'radix-ui';
import React, { type ElementType } from 'react';

import { useGroup } from './group';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive selection:bg-selected selection:text-selected-foreground [&_svg]:!block",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        dashed: 'border-dashed border-2 border-primary',
        secondaryOutline: 'border !border-secondary text-secondary bg-background shadow-xs hover:bg-secondary/10',
        destructiveOutline: 'border !border-destructive text-destructive bg-background shadow-xs hover:bg-destructive/10',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
      testId?: string;
      as?: ElementType;
      to?: string;
      icon?: React.ReactNode;
    }
>(({ className, variant, size, asChild = false, testId, as, to, icon, children, ...props }, ref) => {
  const Comp = as ?? (asChild ? SlotPrimitive.Slot : 'button');
  const { attached, position } = useGroup();

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-testid={testId}
      className={cn(
        buttonVariants({ variant, size, className }),
        attached && position === 'first'
          ? 'rounded-r-none rounded-l-md border-r-0'
          : attached && position === 'last'
            ? 'rounded-l-none rounded-r-md border-l-0'
            : attached && position === 'middle'
              ? 'rounded-none border-l-0 border-r-0'
              : 'rounded-md',
        className,
      )}
      to={to}
      {...props}
    >
      {children}
      {icon && <span className="size-4">{icon}</span>}
    </Comp>
  );
});

Button.displayName = 'Button';

export { Button, buttonVariants };
