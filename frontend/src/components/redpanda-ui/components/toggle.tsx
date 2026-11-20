'use client';

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import type { VariantProps } from 'class-variance-authority';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';
import { toggleVariants } from './toggle/variants';

type ToggleProps = React.ComponentProps<typeof TogglePrimitive> & VariantProps<typeof toggleVariants> & SharedProps;

function Toggle({ className, variant, size, testId, ...props }: ToggleProps) {
  return (
    <TogglePrimitive
      className={cn(toggleVariants({ variant, size, className }))}
      data-slot="toggle"
      data-testid={testId}
      {...props}
    />
  );
}

export { Toggle };
