// Copyright 2026 Redpanda Data, Inc.

import type { useRender } from '@base-ui/react/use-render';
import type {
  Get,
  Step,
  StepperDefinition,
  Stepper as StepperType,
  UseStepperOptions,
} from '@stepperize/react/headless';
import type React from 'react';
import type { ButtonVariants } from '../button';
import type { SharedProps } from '../../lib/utils';

export type StepperVariant = 'horizontal' | 'vertical' | 'circle';
export type StepperLabelOrientation = 'horizontal' | 'vertical';

export type StepperStep = Step & { icon?: React.ReactNode };
export type StepperIndicatorVariant = Exclude<NonNullable<ButtonVariants['variant']>, 'unstyled' | 'value'>;

export type StepperStepProps<Steps extends readonly StepperStep[]> = Omit<
  React.ComponentProps<'button'>,
  'children' | 'title' | 'role' | 'tabIndex' | 'aria-selected' | 'aria-controls'
> & {
  children?: never;
  of: Get.Id<Steps>;
  title: React.ReactNode;
  description?: React.ReactNode;
  panel?: React.ReactNode;
  icon?: React.ReactNode | undefined;
  testId?: string | undefined;
  variant?: StepperIndicatorVariant | undefined;
};

export interface StepperConfigProps {
  labelOrientation?: StepperLabelOrientation | undefined;
  tracking?: boolean | undefined;
  variant?: StepperVariant | undefined;
}

export interface CircleStepIndicatorProps {
  currentStep: number;
  size?: number | undefined;
  strokeWidth?: number | undefined;
  totalSteps: number;
}

export type StepperProviderOptions<Steps extends readonly StepperStep[]> = Pick<
  UseStepperOptions<Steps>,
  'beforeStepChange' | 'defaultData' | 'defaultStep' | 'linear' | 'onStepChange' | 'step'
>;

export type DefineStepperProps<Steps extends readonly StepperStep[]> = Omit<StepperDefinition<Steps>, 'Provider'> & {
  Stepper: {
    Provider: (
      props: StepperProviderOptions<Steps> &
        Omit<React.ComponentProps<'div'>, 'children' | 'defaultValue'> &
        StepperConfigProps & {
          children: React.ReactNode | ((props: { methods: StepperType<Steps> }) => React.ReactNode);
          testId?: string | undefined;
        }
    ) => React.ReactElement;
    Navigation: (props: React.ComponentProps<'nav'> & SharedProps) => React.ReactElement;
    Step: (props: StepperStepProps<Steps>) => React.ReactElement;
    Title: (props: useRender.ComponentProps<'h4'>) => React.ReactElement;
    Description: (props: useRender.ComponentProps<'p'>) => React.ReactElement;
    Panel: (props: useRender.ComponentProps<'div'>) => React.ReactElement;
    Controls: (props: useRender.ComponentProps<'div'>) => React.ReactElement;
  };
};
