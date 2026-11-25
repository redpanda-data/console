// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const textareaVariants = cva(
  'flex w-full rounded-md border !border-input bg-input-fill text-body-lg shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none selection:bg-selection selection:text-selection-foreground placeholder:text-placeholder hover:not-disabled:!border-input-hover hover:not-disabled:bg-input-fill-hover focus-visible:!border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:!border-destructive aria-invalid:ring-invalid motion-reduce:transition-none md:text-body',
  {
    variants: {
      size: {
        sm: 'min-h-12 px-2.5 py-1.5 text-body',
        md: 'min-h-16 px-3 py-2',
        lg: 'min-h-20 px-4 py-3',
      },
      appearance: {
        standard: '',
        embedded:
          'resize-none rounded-none border-0 bg-transparent py-3 shadow-none hover:not-disabled:bg-transparent focus-visible:ring-0',
        document: 'bg-surface-recess p-3 text-foreground',
      },
      textStyle: {
        standard: '',
        monospace: 'font-mono',
        code: 'font-mono text-body-sm leading-5',
        'code-compact': 'font-mono text-2xs leading-relaxed',
      },
      resize: {
        none: 'resize-none',
        vertical: 'resize-y',
        horizontal: 'resize-x',
        both: 'resize',
        auto: 'field-sizing-content',
      },
    },
    defaultVariants: {
      size: 'md',
      appearance: 'standard',
      textStyle: 'standard',
      resize: 'auto',
    },
  }
);
