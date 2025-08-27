import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn } from '../lib/utils';

const textareaVariants = cva(
  'border-input placeholder:text-muted-foreground selection:bg-selected selection:text-selected-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex w-full rounded-md border bg-transparent text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
  {
    variants: {
      size: {
        sm: 'min-h-12 px-2.5 py-1.5 text-sm',
        default: 'min-h-16 px-3 py-2',
        lg: 'min-h-20 px-4 py-3',
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
      size: 'default',
      resize: 'auto',
    },
  },
);

interface TextareaProps extends React.ComponentProps<'textarea'>, VariantProps<typeof textareaVariants> {
  testId?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size, resize, testId, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        data-testid={testId}
        className={cn(textareaVariants({ size, resize }), className)}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';

export { Textarea, textareaVariants };
