import type { VariantProps } from 'class-variance-authority';
import type React from 'react';

import { useFieldContext } from './field';
import { cn, type SharedProps } from '../lib/utils';
import { textareaVariants } from './textarea/variants';

interface TextareaProps extends React.ComponentProps<'textarea'>, VariantProps<typeof textareaVariants>, SharedProps {}

function Textarea({ appearance, className, size, resize, textStyle, testId, ...props }: TextareaProps) {
  const fieldCtx = useFieldContext();
  return (
    <textarea
      {...props}
      aria-describedby={props['aria-describedby'] ?? fieldCtx.errorId}
      aria-invalid={props['aria-invalid'] ?? (fieldCtx.invalid || undefined)}
      className={cn(textareaVariants({ appearance, size, resize, textStyle }), className)}
      data-slot="textarea"
      {...(testId !== undefined && { 'data-testid': testId })}
    />
  );
}

export type { TextareaProps };
export { Textarea };
