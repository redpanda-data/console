import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { motion, type Transition } from 'motion/react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const MotionProgressIndicator = motion.create(ProgressPrimitive.Indicator);

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> &
  SharedProps & {
    transition?: Transition;
  };

function Progress({
  className,
  value,
  transition = { type: 'spring', stiffness: 100, damping: 30 },
  testId,
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      data-slot="progress"
      data-testid={testId}
      value={value}
      {...props}
    >
      <MotionProgressIndicator
        animate={{ x: `-${100 - (value || 0)}%` }}
        className="h-full w-full flex-1 rounded-full bg-primary"
        data-slot="progress-indicator"
        style={{ width: '100%' }}
        transition={transition}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress, type ProgressProps };
