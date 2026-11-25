'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { useRender } from '@base-ui/react/use-render';
import React from 'react';
import { buttonVariants } from '../button/variants';
import { cn } from '../../lib/utils';
import { TriggerRefsContext, useStepperProvider } from './context';
import type { StepperIndicatorVariant, StepperStep, StepperVariant } from './types';

function focusMovement(key: string, variant: StepperVariant | undefined, index: number, lastIndex: number) {
  if (key === 'Home') {
    return { start: 0, direction: 1 };
  }
  if (key === 'End') {
    return { start: lastIndex, direction: -1 };
  }
  const forward = variant === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const backward = variant === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  if (key === forward) {
    return { start: index + 1, direction: 1 };
  }
  if (key === backward) {
    return { start: index - 1, direction: -1 };
  }
  return null;
}

/** Move focus only: activation remains the consumer's guarded native click action. */
function focusStep(
  event: React.KeyboardEvent<HTMLButtonElement>,
  of: string,
  steps: readonly StepperStep[],
  refs: Map<string, HTMLButtonElement>,
  variant: StepperVariant | undefined
) {
  const movement = focusMovement(
    event.key,
    variant,
    steps.findIndex((step) => step.id === of),
    steps.length - 1
  );
  if (movement === null) {
    return;
  }
  for (let index = movement.start; index >= 0 && index < steps.length; index += movement.direction) {
    const step = steps[index];
    const target = step === undefined ? undefined : refs.get(step.id);
    if (target !== undefined && !target.disabled) {
      event.preventDefault();
      target.focus();
      return;
    }
  }
}

type StepIndicatorProps = React.ComponentProps<'button'> & {
  of: string;
  steps: readonly StepperStep[];
  state: 'active' | 'completed' | 'inactive';
  indicatorVariant?: StepperIndicatorVariant | undefined;
};

/** A step action owns its current-step halo, finite tone and native focus recipe. */
export function StepIndicator({ of, steps, state, indicatorVariant, ref, onKeyDown, ...props }: StepIndicatorProps) {
  const { variant } = useStepperProvider();
  const triggerRefs = React.useContext(TriggerRefsContext);
  if (triggerRefs === null) {
    throw new Error('Stepper indicators require their Provider.');
  }
  return useRender({
    defaultTagName: 'button',
    render: <ButtonPrimitive />,
    ref: [
      (node: HTMLButtonElement | null) => {
        if (node === null) {
          triggerRefs.current.delete(of);
        } else {
          triggerRefs.current.set(of, node);
        }
      },
      ref ?? null,
    ],
    props: {
      ...props,
      className: cn(
        'rounded-md',
        buttonVariants({
          variant: indicatorVariant ?? (state === 'inactive' ? 'outline' : 'primary'),
          size: 'icon',
          shape: 'pill',
        }),
        state === 'active' && 'ring-3 ring-secondary/20'
      ),
      'data-component': 'stepper-step-indicator',
      type: 'button',
      onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
        onKeyDown?.(event);
        if (!event.defaultPrevented) {
          focusStep(event, of, steps, triggerRefs.current, variant);
        }
      },
    },
  });
}
