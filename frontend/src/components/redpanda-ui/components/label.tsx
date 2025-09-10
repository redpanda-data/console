import { Label as LabelPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentProps<typeof LabelPrimitive.Root> & { testId?: string }
>(({ className, testId, ...props }, ref) => {
  return (
    <LabelPrimitive.Root
      ref={ref}
      data-slot="label"
      data-testid={testId}
      className={cn(
        'flex gap-1.5 flex-col text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

Label.displayName = 'Label';

export { Label };
