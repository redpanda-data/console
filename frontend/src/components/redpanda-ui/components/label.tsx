import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const Label = React.forwardRef<HTMLLabelElement, React.ComponentPropsWithoutRef<'label'> & SharedProps>(
  ({ className, testId, ...props }, ref) => (
    <label
      className={cn(
        'select-none font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className
      )}
      data-slot="label"
      data-testid={testId}
      ref={ref}
      {...props}
    />
  )
);

Label.displayName = 'Label';

export { Label };
