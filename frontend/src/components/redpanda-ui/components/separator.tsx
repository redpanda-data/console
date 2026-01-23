import { Separator as SeparatorPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  testId,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> & SharedProps) {
  return (
    <SeparatorPrimitive.Root
      className={cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px',
        className
      )}
      data-slot="separator"
      data-testid={testId}
      decorative={decorative}
      orientation={orientation}
      {...props}
    />
  );
}

export { Separator };
