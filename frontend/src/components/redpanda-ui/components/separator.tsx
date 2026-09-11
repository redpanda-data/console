import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const separatorVariants = cva('shrink-0', {
  variants: {
    variant: {
      default: 'bg-border',
      subtle: 'bg-border-subtle',
      strong: 'bg-border-strong',
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

/** A height utility, with any variant prefix (`md:`) and `!` already stripped. */
const HEIGHT_UTILITY = /^!?(?:min-|max-)?h-|^!?size-/;
const WHITESPACE = /\s+/;
const VARIANT_PREFIX = /^.*:/;

/**
 * `align-self: stretch` only stretches an *auto* height — given an explicit one it behaves like
 * `flex-start`, so a caller-sized vertical rule is centred instead. Base UI also allows a
 * `className` function of state, which cannot be read statically.
 */
const setsOwnHeight = (className: SeparatorProps['className']) =>
  typeof className === 'string' &&
  className.split(WHITESPACE).some((token) => HEIGHT_UTILITY.test(token.replace(VARIANT_PREFIX, '')));

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
      className={cn(
        separatorVariants({ variant }),
        orientationClasses[orientation],
        // Pass `self-stretch` to opt back out: cn keeps the later class.
        orientation === 'vertical' && setsOwnHeight(className) && 'self-center',
        className
      )}
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
