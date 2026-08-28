import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { useFieldContext } from './field';
import { cn, type SharedProps } from '../lib/utils';

const textareaVariants = cva(
  '!border-input hover:not-disabled:!border-input-hover focus-visible:!border-ring aria-invalid:!border-destructive flex w-full rounded-md border bg-input-fill text-body-lg shadow-xs outline-none transition-[color,background-color,border-color,box-shadow] selection:bg-selection selection:text-selection-foreground placeholder:text-placeholder hover:not-disabled:bg-input-fill-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-invalid motion-reduce:transition-none md:text-body',
  {
    variants: {
      size: {
        sm: 'min-h-12 px-2.5 py-1.5 text-body',
        md: 'min-h-16 px-3 py-2',
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
      size: 'md',
      resize: 'auto',
    },
  }
);

interface TextareaProps extends React.ComponentProps<'textarea'>, VariantProps<typeof textareaVariants>, SharedProps {}

function Textarea({ className, size, resize, testId, ...props }: TextareaProps) {
  const fieldCtx = useFieldContext();
  return (
    <textarea
      {...props}
      aria-describedby={props['aria-describedby'] ?? fieldCtx.errorId}
      aria-invalid={props['aria-invalid'] ?? (fieldCtx.invalid || undefined)}
      className={cn(textareaVariants({ size, resize }), className)}
      data-slot="textarea"
      {...(testId !== undefined && { 'data-testid': testId })}
    />
  );
}

export { Textarea, textareaVariants };
