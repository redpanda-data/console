'use client';

import { Separator as SeparatorPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  testId,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> & { testId?: string }) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      data-testid={testId}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
