// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const inputVariants = cva(
  'flex w-full min-w-0 border !border-input bg-input-fill text-body-lg shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none [-moz-appearance:textfield] selection:bg-selection selection:text-selection-foreground file:inline-flex file:border-0 file:bg-transparent file:text-body file:font-medium file:text-foreground placeholder:!text-placeholder hover:not-disabled:!border-input-hover hover:not-disabled:bg-input-fill-hover focus-visible:!border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:!border-destructive aria-invalid:ring-invalid motion-reduce:transition-none md:text-body [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
  {
    variants: {
      size: {
        sm: 'h-8 px-2.5 py-1 text-body file:h-6',
        md: 'h-9 px-3 py-1 file:h-7',
        lg: 'h-10 px-4 py-2 file:h-8',
      },
      variant: {
        standard: '',
        password: 'pr-10',
      },
      appearance: {
        standard: '',
        surface: 'bg-background',
        flat: 'shadow-none',
        'surface-flat': 'bg-background shadow-none',
        embedded:
          'rounded-none border-0 bg-transparent shadow-none hover:not-disabled:bg-transparent focus-visible:ring-0',
        inline:
          'rounded-none border-x-0 border-t-0 !border-transparent bg-transparent px-0 font-[inherit] leading-[inherit] [font-weight:inherit] text-[length:inherit] shadow-none hover:not-disabled:!border-transparent hover:not-disabled:bg-transparent focus-visible:!border-ring focus-visible:ring-0 md:text-[length:inherit]',
      },
      textStyle: {
        standard: '',
        monospace: 'font-mono',
      },
      tone: {
        standard: '',
        success:
          'not-aria-invalid:!border-success not-aria-invalid:hover:not-disabled:!border-success not-aria-invalid:focus-visible:!border-success not-aria-invalid:focus-visible:ring-success/30',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'standard',
      appearance: 'standard',
      textStyle: 'standard',
      tone: 'standard',
    },
  }
);
