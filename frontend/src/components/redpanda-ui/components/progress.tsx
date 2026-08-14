'use client';

import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { motion, type Transition } from 'motion/react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const MotionProgressIndicator = motion.create(ProgressPrimitive.Indicator);

const INDETERMINATE_TRANSITION: Transition = {
  duration: 1.5,
  ease: 'easeInOut',
  repeat: Number.POSITIVE_INFINITY,
};

type ProgressContextValue = {
  value: number | null;
};

const ProgressContext = React.createContext<ProgressContextValue>({
  value: 0,
});

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & SharedProps;

function Progress({ className, children, value, testId, ...props }: ProgressProps) {
  const contextValue = React.useMemo<ProgressContextValue>(() => ({ value: value ?? null }), [value]);
  const hasChildren = children !== undefined && children !== null;

  return (
    <ProgressContext.Provider value={contextValue}>
      <ProgressPrimitive.Root
        className={cn(
          hasChildren
            ? 'flex flex-wrap items-center gap-3'
            : 'relative h-2 w-full overflow-hidden rounded-full bg-secondary',
          className
        )}
        data-slot="progress"
        data-testid={testId}
        value={value}
        {...props}
      >
        {hasChildren ? (
          <>
            {children}
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </>
        ) : (
          <ProgressIndicator />
        )}
      </ProgressPrimitive.Root>
    </ProgressContext.Provider>
  );
}

type ProgressTrackProps = React.ComponentProps<typeof ProgressPrimitive.Track> & SharedProps;

function ProgressTrack({ className, testId, ...props }: ProgressTrackProps) {
  return (
    <ProgressPrimitive.Track
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      data-slot="progress-track"
      data-testid={testId}
      {...props}
    />
  );
}

type ProgressIndicatorProps = React.ComponentProps<typeof ProgressPrimitive.Indicator> & SharedProps;

function ProgressIndicator({ className, style, testId, ...props }: ProgressIndicatorProps) {
  const { value } = React.useContext(ProgressContext);

  // Base UI has no built-in indeterminate animation, so keep motion sliding here.
  if (value === null) {
    return (
      <MotionProgressIndicator
        animate={{ x: ['-100%', '200%'] }}
        className={cn('h-full w-1/2 rounded-full bg-primary', className)}
        data-slot="progress-indicator"
        data-testid={testId}
        transition={INDETERMINATE_TRANSITION}
        {...(props as React.ComponentProps<typeof MotionProgressIndicator>)}
      />
    );
  }

  // Determinate progress matches shadcn/ui: a CSS transition driving translateX.
  return (
    <ProgressPrimitive.Indicator
      className={cn('h-full w-full flex-1 rounded-full bg-primary transition-transform', className)}
      data-slot="progress-indicator"
      data-testid={testId}
      style={{ transform: `translateX(-${100 - value}%)`, ...style }}
      {...props}
    />
  );
}

type ProgressLabelProps = React.ComponentProps<typeof ProgressPrimitive.Label> & SharedProps;

function ProgressLabel({ className, testId, ...props }: ProgressLabelProps) {
  return (
    <ProgressPrimitive.Label
      className={cn('text-label', className)}
      data-slot="progress-label"
      data-testid={testId}
      {...props}
    />
  );
}

type ProgressValueProps = React.ComponentProps<typeof ProgressPrimitive.Value> & SharedProps;

function ProgressValue({ className, testId, ...props }: ProgressValueProps) {
  return (
    <ProgressPrimitive.Value
      className={cn('ml-auto text-muted-foreground text-sm tabular-nums', className)}
      data-slot="progress-value"
      data-testid={testId}
      {...props}
    />
  );
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
  type ProgressProps,
  type ProgressTrackProps,
  type ProgressIndicatorProps,
  type ProgressLabelProps,
  type ProgressValueProps,
};
