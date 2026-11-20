'use client';

// Copyright 2026 Redpanda Data, Inc.

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';
import { cn, type DataAttributes, type SharedProps } from '../../lib/utils';
import { ActiveStepContext, useStepperProvider } from './context';
import type { CircleStepIndicatorProps, StepperConfigProps } from './types';

export const Panel = ({ children, render, ...props }: useRender.ComponentProps<'div'>) => {
  const { tracking } = useStepperProvider();
  const activeStepId = React.useContext(ActiveStepContext);
  // Scroll when the active step changes, whether the panel remounts (keyed per step) or is reused
  // (rendered through `methods.match`). Keying on the step, not every commit, stops typing in a
  // field or switching an inner tab from re-centering the panel.
  const panelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(
    function scrollActivePanelIntoView() {
      if (tracking === true && activeStepId !== null && panelRef.current !== null) {
        scrollIntoStepperPanel(panelRef.current);
      }
    },
    [tracking, activeStepId]
  );

  const elementProps = {
    'data-component': 'stepper-step-panel',
    children,
  } satisfies useRender.ElementProps<'div'> & DataAttributes;

  return useRender({
    defaultTagName: 'div',
    ref: panelRef,
    render,
    props: mergeProps<'div'>(elementProps, props),
  });
};

export const Controls = ({ children, className, render, ...props }: useRender.ComponentProps<'div'>) => {
  const elementProps = {
    className: cn('flex justify-end gap-4', className),
    'data-component': 'stepper-controls',
    children,
  } satisfies useRender.ElementProps<'div'> & DataAttributes;
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(elementProps, props),
  });
};

export const Title = ({ children, className, render, ...props }: useRender.ComponentProps<'h4'>) => {
  const elementProps = {
    className: cn('selection:bg-selection selection:text-selection-foreground', className),
    'data-component': 'stepper-step-title',
    children,
  } satisfies useRender.ElementProps<'h4'> & DataAttributes;
  return useRender({
    defaultTagName: 'h4',
    render: render ?? <h4 className="text-heading-sm">{children}</h4>,
    props: mergeProps<'h4'>(elementProps, props),
  });
};

export const Description = ({ children, className, render, ...props }: useRender.ComponentProps<'p'>) => {
  const elementProps = {
    className: cn('text-body text-subtle selection:bg-selection selection:text-selection-foreground', className),
    'data-component': 'stepper-step-description',
    children,
  } satisfies useRender.ElementProps<'p'> & DataAttributes;
  return useRender({
    defaultTagName: 'p',
    render: render ?? <div className="text-body">{children}</div>,
    props: mergeProps<'p'>(elementProps, props),
  });
};

const StepperSeparator = ({
  orientation,
  isLast,
  labelOrientation,
  state,
  disabled,
}: {
  isLast: boolean;
  state: string;
  disabled?: boolean | undefined;
} & VariantProps<typeof classForSeparator>) => {
  if (isLast) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className={classForSeparator({ orientation, labelOrientation })}
      data-component="stepper-separator"
      data-disabled={disabled}
      data-orientation={orientation}
      data-state={state}
    />
  );
};

export const CircleStepIndicator = ({
  currentStep,
  totalSteps,
  size = 80,
  strokeWidth = 6,
  labelledBy,
}: CircleStepIndicatorProps & { labelledBy: string }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const fillPercentage = (currentStep / totalSteps) * 100;
  const dashOffset = circumference - (circumference * fillPercentage) / 100;
  return (
    <div
      aria-labelledby={labelledBy}
      aria-valuemax={totalSteps}
      aria-valuemin={1}
      aria-valuenow={currentStep}
      className="relative inline-flex items-center justify-center"
      data-component="stepper-step-indicator"
      role="progressbar"
      tabIndex={-1}
    >
      <svg height={size} width={size}>
        <title>Step Indicator</title>
        <circle
          className="text-subtle"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
        />
        <circle
          className="text-primary transition-[color,background-color,border-color,opacity,transform] duration-300 ease-in-out motion-reduce:transition-none"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeWidth={strokeWidth}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span aria-live="polite" className="text-label selection:bg-selection selection:text-selection-foreground">
          {currentStep} of {totalSteps}
        </span>
      </div>
    </div>
  );
};

const classForNavigationList = cva('flex gap-2', {
  variants: {
    variant: {
      horizontal: 'flex-row items-center justify-between',
      vertical: 'flex-col',
      circle: 'flex-row items-center justify-between',
    },
  },
});

const classForSeparator = cva(
  [
    'bg-surface-subtle',
    'data-[disabled]:opacity-50 data-[state=completed]:bg-primary',
    'transition-[color,background-color,border-color,opacity,transform] duration-300 ease-in-out motion-reduce:transition-none',
  ],
  {
    variants: {
      orientation: {
        horizontal: 'h-0.5 flex-1',
        vertical: 'h-full w-0.5',
      },
      labelOrientation: {
        vertical: 'absolute top-5 right-[calc(-50%+20px)] left-[calc(50%+30px)] block shrink-0',
      },
    },
  }
);

function scrollIntoStepperPanel(node: HTMLDivElement) {
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function StepperNavigation({
  children,
  'aria-label': ariaLabel = 'Stepper Navigation',
  testId,
  ...props
}: React.ComponentProps<'nav'> & SharedProps) {
  const { variant } = useStepperProvider();
  return (
    <nav aria-label={ariaLabel} data-component="stepper-navigation" data-testid={testId} {...props}>
      <ol className={classForNavigationList({ variant })} data-component="stepper-navigation-list">
        {children}
      </ol>
    </nav>
  );
}

/** Connectors and inline content stay inside their actual ordered-list item. */
export function StepLayout({
  children,
  className,
  disabled,
  isLast,
  labelOrientation,
  panel,
  state,
  variant,
}: {
  children: React.ReactNode;
  className: string | undefined;
  disabled: boolean;
  isLast: boolean;
  labelOrientation: StepperConfigProps['labelOrientation'];
  panel: React.ReactNode;
  state: 'active' | 'completed' | 'inactive';
  variant: StepperConfigProps['variant'];
}) {
  return (
    <li
      className={cn(
        'group peer relative flex flex-col',
        variant === 'horizontal' && !isLast && 'flex-auto',
        labelOrientation === 'vertical' && 'min-w-0 flex-1',
        className
      )}
      data-component="stepper-step"
      data-disabled={disabled || undefined}
      data-label-orientation={labelOrientation}
      data-state={state}
      data-variant={variant}
    >
      <div
        className={cn('relative flex items-center gap-2', labelOrientation === 'vertical' && 'flex-col justify-center')}
      >
        {children}
        {variant === 'horizontal' && (
          <StepperSeparator
            disabled={disabled}
            isLast={isLast}
            labelOrientation={labelOrientation === 'vertical' ? 'vertical' : undefined}
            orientation="horizontal"
            state={state}
          />
        )}
      </div>
      {variant === 'vertical' ? (
        <div className="flex gap-4">
          {!isLast && (
            <div className="flex justify-center ps-[calc(var(--spacing)_*_4.5_-_1px)]">
              <StepperSeparator disabled={disabled} isLast={isLast} orientation="vertical" state={state} />
            </div>
          )}
          <div className="my-3 flex-1 ps-4">{panel}</div>
        </div>
      ) : (
        panel
      )}
    </li>
  );
}
