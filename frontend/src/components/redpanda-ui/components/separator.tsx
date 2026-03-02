import { cva, type VariantProps } from 'class-variance-authority';
import { Separator as SeparatorPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const separatorVariants = cva(
  'shrink-0 data-[orientation=horizontal]:h-px data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px',
  {
    variants: {
      variant: {
        default: 'bg-divider-default',
        subtle: 'bg-divider-subtle',
        strong: 'bg-divider-strong',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type SeparatorVariant = VariantProps<typeof separatorVariants>['variant'];

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  variant,
  testId,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> &
  SharedProps & {
    variant?: SeparatorVariant;
  }) {
  return (
    <SeparatorPrimitive.Root
      className={cn(separatorVariants({ variant }), className)}
      data-slot="separator"
      data-testid={testId}
      decorative={decorative}
      orientation={orientation}
      {...props}
    />
  );
}

export { Separator, separatorVariants };
