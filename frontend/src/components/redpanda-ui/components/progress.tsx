'use client';

import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { domAnimation, LazyMotion, type Transition } from 'motion/react';
import { create as createMinimalMotionComponent } from 'motion/react-m';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const MotionProgressIndicator = createMinimalMotionComponent('div');

const INDETERMINATE_TRANSITION: Transition = {
  duration: 1.5,
  ease: 'easeInOut',
  repeat: Number.POSITIVE_INFINITY,
};

interface ProgressContextValue {
  value: number | null;
  variant: ProgressVariant;
}

const ProgressContext = React.createContext<ProgressContextValue>({
  value: 0,
  variant: 'default',
});

const progressIndicatorColors = {
  default: 'bg-primary',
  success: 'bg-success-strong',
  warning: 'bg-warning-strong',
};

type ProgressVariant = keyof typeof progressIndicatorColors;

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> &
  SharedProps & { variant?: ProgressVariant | undefined };

function Progress({ className, children, value, variant = 'default', testId, ...props }: ProgressProps) {
  const hasChildren = children !== undefined && children !== null;

  return (
    <ProgressContext.Provider value={{ value: value ?? null, variant }}>
      <ProgressPrimitive.Root
        className={cn(
          hasChildren
            ? 'flex flex-wrap items-center gap-3'
            : 'relative h-2 w-full overflow-hidden rounded-full bg-surface-subtle',
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
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-subtle', className)}
      data-slot="progress-track"
      data-testid={testId}
      {...props}
    />
  );
}

type ProgressIndicatorProps = React.ComponentProps<typeof ProgressPrimitive.Indicator> & SharedProps;

function ProgressIndicator({ className, testId, ...props }: ProgressIndicatorProps) {
  const { value, variant } = React.useContext(ProgressContext);

  // Base UI has no built-in indeterminate animation, so keep motion sliding here.
  if (value === null) {
    return (
      <LazyMotion features={domAnimation}>
        <ProgressPrimitive.Indicator
          className={cn('h-full w-1/2 rounded-full', progressIndicatorColors[variant], className)}
          data-slot="progress-indicator"
          data-testid={testId}
          render={<MotionProgressIndicator animate={{ x: ['-100%', '200%'] }} transition={INDETERMINATE_TRANSITION} />}
          {...props}
        />
      </LazyMotion>
    );
  }

  // Base UI sizes the fill with an inline `width`; adding shadcn/ui's translateX would apply the percentage twice.
  return (
    <ProgressPrimitive.Indicator
      className={cn(
        'h-full rounded-full transition-[width] motion-reduce:transition-none',
        progressIndicatorColors[variant],
        className
      )}
      data-slot="progress-indicator"
      data-testid={testId}
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
      className={cn('ml-auto text-body text-subtle tabular-nums', className)}
      data-slot="progress-value"
      data-testid={testId}
      {...props}
    />
  );
}

export {
  Progress,
  ProgressIndicator,
  type ProgressIndicatorProps,
  ProgressLabel,
  type ProgressLabelProps,
  type ProgressProps,
  ProgressTrack,
  type ProgressTrackProps,
  ProgressValue,
  type ProgressValueProps,
};
