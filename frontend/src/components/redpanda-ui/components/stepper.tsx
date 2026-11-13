// Copyright 2026 Redpanda Data, Inc.

'use client';

import { type PartProps, renderElement } from '@ui-sdk/react/primitive';
import * as Tabs from '@ui-sdk/react/tabs';
import React from 'react';

import { buttonVariants } from './button';
import { cn, type SharedProps } from '../lib/utils';

type Step = { id: string; title?: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode };
export type StepperVariant = 'horizontal' | 'vertical' | 'circle';
export type StepperLabelOrientation = 'horizontal' | 'vertical';
type StepId<Steps extends readonly Step[]> = Steps[number]['id'];
type Methods<Steps extends readonly Step[]> = {
  id: StepId<Steps>;
  current: Steps[number];
  index: number;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  prev: () => void;
  goTo: (id: StepId<Steps>) => void;
  reset: () => void;
  get: (id: StepId<Steps>) => Steps[number] | undefined;
  match: <Result>(cases: Partial<Record<StepId<Steps>, (step: Steps[number]) => Result>>) => Result | undefined;
};
export type StepperProviderOptions<Steps extends readonly Step[]> = {
  defaultStep?: StepId<Steps>;
  initialStep?: StepId<Steps>;
  step?: StepId<Steps>;
  onStepChange?: (step: StepId<Steps>) => void;
};
type ProviderProps<Steps extends readonly Step[]> = StepperProviderOptions<Steps> &
  Omit<React.ComponentProps<'div'>, 'children' | 'defaultValue'> &
  SharedProps & {
    variant?: StepperVariant;
    labelOrientation?: StepperLabelOrientation;
    tracking?: boolean;
    children: React.ReactNode | ((props: { methods: Methods<Steps> }) => React.ReactNode);
  };
const ActiveStepContext = React.createContext<string>('');
type WrapperProps<Tag extends 'div' | 'h4' | 'p'> = Omit<PartProps<Tag>, 'children'> & { children?: React.ReactNode };
function Panel({ render, ...props }: WrapperProps<'div'>) {
  const value = React.useContext(ActiveStepContext);
  return <Tabs.TabsPanel className="outline-none" render={render} value={value} {...props} />;
}
function Controls({ className, render, ...props }: WrapperProps<'div'>) {
  return renderElement('div', { ...props, className: cn('flex items-center gap-2', className) }, render);
}
function Title({ className, render, ...props }: WrapperProps<'h4'>) {
  return renderElement('h4', { ...props, className: cn('text-heading-sm', className) }, render);
}
function Description({ className, render, ...props }: WrapperProps<'p'>) {
  return renderElement('p', { ...props, className: cn('text-body text-subtle', className) }, render);
}

export function defineStepper<const Steps extends readonly Step[]>(...steps: Steps) {
  if (!steps.length || new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw new Error('Stepper requires unique steps');
  }
  const Context = React.createContext<{
    methods: Methods<Steps>;
    variant: StepperVariant;
    labelOrientation: StepperLabelOrientation;
  } | null>(null);
  function useContext() {
    const context = React.useContext(Context);
    if (!context) {
      throw new Error('Missing Stepper.Provider');
    }
    return context;
  }
  function useLocalStepper(options: StepperProviderOptions<Steps> = {}): Methods<Steps> {
    const initial: StepId<Steps> = options.defaultStep ?? options.initialStep ?? steps[0].id;
    const [local, setLocal] = React.useState(initial);
    const id: StepId<Steps> = options.step ?? local;
    const index = steps.findIndex((step) => step.id === id);
    if (index < 0) {
      throw new Error(`Unknown step: ${id}`);
    }
    const goTo = (next: StepId<Steps>) => {
      if (!steps.some((step) => step.id === next) || next === id) {
        return;
      }
      options.onStepChange?.(next);
      if (options.step === undefined) {
        setLocal(next);
      }
    };
    return {
      id,
      index,
      current: steps[index],
      isFirst: index === 0,
      isLast: index === steps.length - 1,
      goTo,
      next: () => {
        if (index < steps.length - 1) {
          goTo(steps[index + 1].id);
        }
      },
      prev: () => {
        if (index > 0) {
          goTo(steps[index - 1].id);
        }
      },
      reset: () => goTo(initial),
      get: (requested) => steps.find((step) => step.id === requested),
      match: (cases) => cases[id]?.(steps[index]),
    };
  }
  function useStepper(options?: StepperProviderOptions<Steps>) {
    const local = useLocalStepper(options);
    return React.useContext(Context)?.methods ?? local;
  }
  function Provider({
    children,
    testId,
    className,
    variant = 'horizontal',
    labelOrientation = 'horizontal',
    tracking: _tracking,
    defaultStep,
    initialStep,
    step,
    onStepChange,
    ...props
  }: ProviderProps<Steps>) {
    const methods = useLocalStepper({ defaultStep, initialStep, step, onStepChange });
    return (
      <Context.Provider value={{ methods, variant, labelOrientation }}>
        <ActiveStepContext.Provider value={methods.id}>
          <Tabs.Tabs
            activation="manual"
            aria-label="Workflow steps"
            className={cn('w-full', className)}
            data-component="stepper"
            data-testid={testId}
            orientation={variant === 'vertical' ? 'vertical' : 'horizontal'}
            value={methods.id}
            {...props}
            onValueChange={(next, details) => {
              // Advancing runs the form's validated Continue action, never an agent's direct tab selection.
              if (next === null || steps.findIndex((step) => step.id === next) > methods.index) {
                details.cancel();
                return;
              }
              methods.goTo(next);
            }}
          >
            {typeof children === 'function' ? children({ methods }) : children}
          </Tabs.Tabs>
        </ActiveStepContext.Provider>
      </Context.Provider>
    );
  }
  function Navigation({
    children,
    className,
    testId,
    'aria-label': label = 'Workflow steps',
    ...props
  }: React.ComponentProps<'nav'> & SharedProps) {
    const { variant } = useContext();
    return (
      <nav aria-label={label} data-testid={testId} {...props}>
        <Tabs.TabsList
          className={cn(
            'flex items-center justify-between gap-2',
            variant === 'vertical' && 'flex-col items-stretch',
            className
          )}
          render={<ol />}
        >
          {children}
        </Tabs.TabsList>
      </nav>
    );
  }
  function Step({
    of,
    children,
    icon,
    className,
    testId,
    disabled,
    ...props
  }: Omit<React.ComponentProps<'button'>, 'value'> &
    SharedProps & {
      of: StepId<Steps>;
      icon?: React.ReactNode;
      variant?: React.ComponentProps<typeof import('./button').Button>['variant'];
    }) {
    const { methods, labelOrientation, variant } = useContext();
    const index = steps.findIndex((step) => step.id === of);
    const labelId = React.useId();
    const active = methods.id === of;
    return (
      <li
        className={cn(
          'relative flex flex-1 items-center gap-3',
          labelOrientation === 'vertical' && 'flex-col',
          className
        )}
        data-state={active ? 'active' : index < methods.index ? 'completed' : 'inactive'}
      >
        <Tabs.TabsTab
          aria-current={active ? 'step' : undefined}
          aria-labelledby={labelId}
          className={cn(
            buttonVariants({ variant: index <= methods.index ? 'primary' : 'outline', size: 'icon' }),
            'rounded-full',
            active && 'ring-3 ring-secondary/20'
          )}
          data-testid={testId}
          disabled={disabled || index > methods.index}
          value={of}
          {...props}
        >
          {icon ?? steps[index]?.icon ?? index + 1}
        </Tabs.TabsTab>
        <div className="flex flex-col items-start" id={labelId}>
          {children}
        </div>
        {index < steps.length - 1 && variant !== 'vertical' ? (
          <span
            aria-hidden="true"
            className={cn('h-0.5 min-w-4 flex-1 bg-surface-subtle', index < methods.index && 'bg-primary')}
          />
        ) : null}
      </li>
    );
  }
  return { steps, useStepper, Stepper: { Provider, Navigation, Step, Title, Description, Panel, Controls } };
}
export type DefineStepperProps<Steps extends readonly Step[]> = ReturnType<typeof defineStepper<Steps>>;
