// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const kbdVariants = cva(
  // Inside a tooltip the key takes its ink from the popup, as shadcn's does, so it reads on `bg-primary`.
  'pointer-events-none inline-flex items-center justify-center rounded-md font-mono select-none [[data-slot=tooltip-content]_&]:!border-primary-foreground/30 [[data-slot=tooltip-content]_&]:bg-primary-foreground/10 [[data-slot=tooltip-content]_&]:text-primary-foreground',
  {
    variants: {
      variant: {
        filled: 'border !border-border bg-accent text-accent-foreground',
        outline: 'border !border-input text-accent-foreground',
      },
      size: {
        xs: 'h-5 min-w-5 px-1 text-2xs leading-[0.75rem] [&_svg]:size-3',
        sm: 'h-6 min-w-6 px-1 text-body-sm leading-[0.75rem] [&_svg]:size-3',
        md: 'h-7 min-w-7 px-1.5 text-body-sm [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'filled',
      size: 'md',
    },
  }
);
