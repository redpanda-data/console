import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';

import { cn } from '../lib/utils';

const spinnerVariants = cva('animate-spin', {
  variants: {
    size: {
      xs: 'size-3',
      sm: 'size-4',
      md: 'size-6',
      lg: 'size-8',
      xl: 'size-12',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

interface SpinnerProps extends React.ComponentProps<'svg'>, VariantProps<typeof spinnerVariants> {}

function Spinner({ className, size, ...props }: SpinnerProps) {
  return (
    <Loader2Icon role="status" aria-label="Loading" className={cn(spinnerVariants({ size }), className)} {...props} />
  );
}

export { Spinner, type SpinnerProps };
