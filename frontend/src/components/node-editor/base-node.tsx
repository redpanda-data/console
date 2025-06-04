import { type HTMLAttributes, forwardRef } from 'react';

import { cn } from '@/lib/utils';

export const BaseNode = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { selected?: boolean }>(
  ({ className, selected, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative rounded-md border bg-card p-5 text-card-foreground',
        className,
        selected ? 'border-muted-foreground shadow-lg' : '',
        'hover:ring-1',
      )}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: part of base node implementation
      tabIndex={0}
      {...props}
    />
  ),
);

BaseNode.displayName = 'BaseNode';
