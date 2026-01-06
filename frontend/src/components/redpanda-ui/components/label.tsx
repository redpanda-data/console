import { Label as LabelPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentProps<typeof LabelPrimitive.Root> & SharedProps
>(({ className, testId, ...props }, ref) => (
  <LabelPrimitive.Root
    className={cn(
      'select-none font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
      className
    )}
    data-slot="label"
    data-testid={testId}
    ref={ref}
    {...props}
  />
));

Label.displayName = 'Label';

export { Label };
