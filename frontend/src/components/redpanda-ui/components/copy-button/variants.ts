// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-body font-medium whitespace-nowrap transition-all outline-none focus-visible:!border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:!border-destructive aria-invalid:ring-invalid motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      // A subset of Button's variants, and each one paints Button's tones — the same name means the
      // same colour in both. `default` is the neutral member, and what a bare CopyButton gets.
      variant: {
        default:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary-hover active:bg-secondary-pressed',
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:bg-primary-pressed',
        destructive:
          'bg-surface-destructive text-destructive-foreground shadow-xs hover:bg-surface-destructive-hover focus-visible:ring-destructive/50 active:bg-surface-destructive-pressed',
        outline:
          'border !border-secondary-line bg-transparent text-secondary shadow-xs hover:!border-secondary-line-hover hover:bg-secondary-wash active:!border-secondary-line-pressed active:bg-secondary-wash-pressed disabled:!border-border disabled:text-disabled',

        ghost:
          'bg-transparent text-secondary hover:bg-secondary-wash active:bg-secondary-wash-pressed disabled:text-disabled',
      },
      size: {
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        md: 'h-9 px-4 py-2 has-[>svg]:px-3',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        // Mirrors Button's icon-xs, for a copy affordance inside a table row.
        'icon-xs': 'size-6 [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);
