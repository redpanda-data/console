import { type HTMLAttributes, forwardRef } from 'react';

import { cn } from '@/lib/utils';

export const BaseNode = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { selected?: boolean }>(
  ({ className, selected, onClick, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative rounded-md border bg-card p-5 text-card-foreground cursor-pointer',
        className,
        selected ? 'border-muted-foreground shadow-lg' : '',
        'hover:ring-1 hover:ring-blue-500/50',
      )}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: part of base node implementation
      tabIndex={0}
      onClick={onClick}
      {...props}
    />
  ),
);

BaseNode.displayName = 'BaseNode';
