import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const separatorVariants = cva('shrink-0', {
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
});

// Plain classes (not data-[orientation] variants) so a consumer's explicit size wins.
const orientationClasses = {
  horizontal: 'h-px w-full',
  vertical: 'w-px self-stretch',
} as const;

export type SeparatorVariant = VariantProps<typeof separatorVariants>['variant'];

type SeparatorProps = React.ComponentProps<typeof SeparatorPrimitive> &
  SharedProps & {
    variant?: SeparatorVariant;
    /** `true` (default): decorative (`role="none"` + `aria-hidden`). `false`: native `role="separator"`. */
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
      className={cn(separatorVariants({ variant }), orientationClasses[orientation], className)}
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
