'use client';

// Copyright 2026 Redpanda Data, Inc.

import { defineStepper as defineStepperPrimitive, type Stepper as StepperType } from '@stepperize/react/headless';
import React from 'react';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn } from '../lib/utils';
import { omitUndefined } from '../lib/utils/omit-undefined';
import { ActiveStepContext, StepperContext, TriggerRefsContext, useStepperProvider } from './stepper/context';
import { CircleStepIndicator, Controls, Description, Panel, StepLayout, StepperNavigation, Title } from './stepper/parts';
import { StepIndicator } from './stepper/step-indicator';
import type { DefineStepperProps, StepperStep } from './stepper/types';

export type {
  CircleStepIndicatorProps,
  DefineStepperProps,
  StepperConfigProps,
  StepperIndicatorVariant,
  StepperLabelOrientation,
  StepperProviderOptions,
  StepperStep,
  StepperStepProps,
  StepperVariant,
} from './stepper/types';

const defineStepper = <const Steps extends readonly StepperStep[]>(...steps: Steps): DefineStepperProps<Steps> => {
  const { Provider, ...definition } = defineStepperPrimitive<Steps>(steps);
  const { useStepperContext } = definition;
  const allSteps: readonly StepperStep[] = definition.steps;
  /** The shared stepper of the nearest `Stepper.Provider` of this definition, or null outside one. */
  const SharedStepperContext = React.createContext<StepperType<Steps> | null>(null);

  /**
   * v5 semantics: inside `Stepper.Provider` this returns the Provider's shared stepper; outside one
   * it creates an independent stepper. v8's own `useStepper` always creates a local instance, so a
   * child such as a URL-sync component calling `useStepper().goTo()` would silently stop driving
   * the Provider. Both hooks always run, so hook order never depends on where it is rendered.
   */
  const useStepper: typeof definition.useStepper = (options) => {
    const local = definition.useStepper(options);
    const shared = React.useContext(SharedStepperContext);
    return shared ?? local;
  };

  const StepperContainer = ({
    children,
    className,
    testId,
    ...props
  }: Omit<React.ComponentProps<'div'>, 'children'> & {
    children: React.ReactNode | ((props: { methods: StepperType<Steps> }) => React.ReactNode);
    testId?: string | undefined;
  }) => {
    // v8: `useStepper()` always creates a new local instance; the Provider's shared state comes from the context.
    const methods = useStepperContext();
    const triggerRefs = React.useRef(new Map<string, HTMLButtonElement>());

    const renderedChildren = typeof children === 'function' ? children({ methods }) : children;

    return (
      <SharedStepperContext.Provider value={methods}>
        <TriggerRefsContext.Provider value={triggerRefs}>
          <ActiveStepContext.Provider value={methods.id}>
            <div className={cn('w-full', className)} data-component="stepper" data-testid={testId} {...props}>
              {renderedChildren}
            </div>
          </ActiveStepContext.Provider>
        </TriggerRefsContext.Provider>
      </SharedStepperContext.Provider>
    );
  };

  return {
    ...definition,
    useStepper,
    Stepper: {
      Provider: ({
        variant = 'horizontal',
        labelOrientation = 'horizontal',
        tracking = false,
        beforeStepChange,
        defaultData,
        defaultStep,
        linear,
        onStepChange,
        step,
        children,
        ...props
      }) => (
        <StepperContext.Provider value={{ variant, labelOrientation, tracking }}>
          <Provider
            {...omitUndefined({ beforeStepChange })}
            {...omitUndefined({ defaultData })}
            {...omitUndefined({ defaultStep })}
            {...omitUndefined({ linear })}
            {...omitUndefined({ onStepChange })}
            {...omitUndefined({ step })}
          >
            <StepperContainer {...props}>{children}</StepperContainer>
          </Provider>
        </StepperContext.Provider>
      ),
      Navigation: StepperNavigation,
      Step: ({
        title,
        description,
        panel,
        className,
        icon,
        testId,
        of,
        ref,
        disabled,
        variant: indicatorVariant,
        ...props
      }) => {
        const { variant, labelOrientation } = useStepperProvider();
        const currentIndex = useStepperContext((stepper) => stepper.index);
        const canGoTo = useStepperContext((stepper) => stepper.canGoTo(of));
        const slotId = React.useId();
        const titleId = `${slotId}-title`;
        const descriptionId = `${slotId}-description`;
        const stepIndex = allSteps.findIndex((item) => item.id === of);
        const stepIcon = allSteps[stepIndex]?.icon ?? icon;
        const isLast = stepIndex === allSteps.length - 1;
        const dataState = getStepState(currentIndex, stepIndex);
        const isDisabled = disabled === true || !canGoTo;
        const labels = (
          <div className="flex flex-col items-start" data-component="stepper-step-content">
            <div id={titleId}>{title}</div>
            {hasSlotContent(description) && <div id={descriptionId}>{description}</div>}
          </div>
        );

        if (variant === 'circle') {
          return (
            <li className={cn('flex shrink-0 items-center gap-4 rounded-md', className)} data-component="stepper-step">
              <CircleStepIndicator currentStep={stepIndex + 1} labelledBy={titleId} totalSteps={steps.length} />
              {labels}
              {panel}
            </li>
          );
        }

        return (
          <StepLayout
            className={className}
            disabled={isDisabled}
            isLast={isLast}
            labelOrientation={labelOrientation}
            panel={panel}
            state={dataState}
            variant={variant}
          >
            <StepIndicator
              {...props}
              aria-current={dataState === 'active' ? 'step' : undefined}
              aria-describedby={hasSlotContent(description) ? descriptionId : undefined}
              aria-labelledby={titleId}
              data-testid={testId}
              disabled={isDisabled}
              indicatorVariant={indicatorVariant}
              of={of}
              ref={ref}
              state={dataState}
              steps={allSteps}
            >
              <span aria-hidden="true">{stepIcon ?? stepIndex + 1}</span>
            </StepIndicator>
            {labels}
          </StepLayout>
        );
      },
      Title,
      Description,
      Panel,
      Controls,
    },
  };
};

function getStepState(currentIndex: number, stepIndex: number) {
  if (currentIndex === stepIndex) {
    return 'active';
  }
  return currentIndex > stepIndex ? 'completed' : 'inactive';
}

export { defineStepper };
