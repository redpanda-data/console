'use client';

import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const Label = ({ className, testId, ...props }: React.ComponentProps<'label'> & SharedProps) => (
  <label
    className={cn(
      'flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
      className
    )}
    data-slot="label"
    data-testid={testId}
    {...props}
  />
);

export { Label };
