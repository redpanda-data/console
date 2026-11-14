import { commitAgentChange } from '../lib/commit-agent-change';
import { Textarea as TextareaPrimitive } from '@ui-sdk/react/textarea';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';

import { useFieldContext } from './field';
import { cn, type SharedProps } from '../lib/utils';

const textareaVariants = cva(
  'flex w-full rounded-md border !border-input bg-input-fill text-body-lg shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none selection:bg-selection selection:text-selection-foreground placeholder:text-placeholder hover:not-disabled:!border-input-hover hover:not-disabled:bg-input-fill-hover focus-visible:!border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:!border-destructive aria-invalid:ring-invalid motion-reduce:transition-none md:text-body',
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

interface TextareaProps
  extends Omit<React.ComponentProps<'textarea'>, 'onChange' | 'onSubmit'>,
    VariantProps<typeof textareaVariants>,
    SharedProps {
  onValueChange?: React.ComponentProps<typeof TextareaPrimitive>['onValueChange'];
}

function Textarea({ className, size, resize, testId, onValueChange, ...props }: TextareaProps) {
  const nativeProps: React.ComponentProps<'textarea'> = props;
  const { onChange: _nativeChange, onSubmit: _nativeSubmit, ...elementProps } = nativeProps;
  const fieldCtx = useFieldContext();
  return (
    <TextareaPrimitive
      {...elementProps}
      onValueChange={(value, details) => commitAgentChange(onValueChange, value, details)}
      aria-describedby={props['aria-describedby'] ?? fieldCtx.errorId}
      aria-invalid={props['aria-invalid'] ?? (fieldCtx.invalid || undefined)}
      className={cn(textareaVariants({ size, resize }), className)}
      data-slot="textarea"
      defaultValue={props.defaultValue === undefined ? undefined : String(props.defaultValue)}
      value={props.value === undefined ? undefined : String(props.value)}
      {...(testId !== undefined && { 'data-testid': testId })}
    />
  );
}

export { Textarea, textareaVariants };
