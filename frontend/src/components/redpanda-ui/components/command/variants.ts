// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const commandVariants = cva(
  'flex size-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
  {
    variants: {
      variant: {
        elevated: 'border !border-input shadow-md',
        standalone: 'rounded-lg border !border-input shadow-md',
        minimal: '',
        dialog:
          '**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:size-5',
      },
      size: {
        sm: 'max-w-sm min-w-75',
        md: 'max-w-lg min-w-100 md:min-w-112.5',
        lg: 'max-w-2xl min-w-125',
        full: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'elevated',
      // Width-less by default so embedded popovers size to their container (like stock shadcn).
      size: 'full',
    },
  }
);
