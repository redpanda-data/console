import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';
import { cva, type VariantProps } from 'class-variance-authority';
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

type SeparatorProps = React.ComponentProps<typeof SeparatorPrimitive> &
  SharedProps & {
    variant?: SeparatorVariant;
    /**
     * When `true` (the Radix default), the separator is purely decorative and
     * will not be announced to assistive tech (`role="none"` + `aria-hidden`).
     * When `false`, the native Base UI `role="separator"` with an orientation
     * is used. Honored faithfully — this is not a compat no-op.
     */
    decorative?: boolean;
  };

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  variant,
  testId,
  ...props
}: SeparatorProps) {
  const a11yProps = decorative ? { 'aria-hidden': true, role: 'none' as const } : {};
  return (
    <SeparatorPrimitive
      className={cn(separatorVariants({ variant }), className)}
      data-orientation={orientation}
      data-slot="separator"
      data-testid={testId}
      orientation={orientation}
      {...a11yProps}
      {...props}
    />
  );
}

export { Separator, separatorVariants };
