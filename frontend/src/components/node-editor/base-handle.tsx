import { Handle, type HandleProps } from '@xyflow/react';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export type BaseHandleProps = HandleProps;

export const BaseHandle = forwardRef<HTMLDivElement, BaseHandleProps>(({ className, children, ...props }, ref) => {
  return (
    <Handle
      ref={ref}
      {...props}
      className={cn(
        'h-[11px] w-[11px] rounded-full border-2 border-slate-400 bg-white transition hover:border-blue-500 hover:bg-blue-100 dark:border-slate-500 dark:bg-slate-700 dark:hover:border-blue-400 dark:hover:bg-blue-900 z-10',
        className,
      )}
      {...props}
    >
      {children}
    </Handle>
  );
});

BaseHandle.displayName = 'BaseHandle';
