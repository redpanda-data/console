import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';

import { cn, type SharedProps } from '../lib/utils';

const spinnerVariants = cva('size-4 animate-spin motion-reduce:animate-none', {
  variants: {
    tone: {
      default: '',
      primary: 'text-primary',
      brand: 'text-brand',
      informative: 'text-informative',
      success: 'text-success',
      warning: 'text-warning',
      destructive: 'text-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
});

type SpinnerProps = React.ComponentProps<'svg'> &
  SharedProps & { tone?: NonNullable<VariantProps<typeof spinnerVariants>['tone']> | undefined };

function Spinner({ className, testId, tone = 'default', ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn(spinnerVariants({ tone }), className)}
      data-testid={testId}
      data-tone={tone}
      role="status"
      {...props}
    />
  );
}

export { Spinner, type SpinnerProps };
