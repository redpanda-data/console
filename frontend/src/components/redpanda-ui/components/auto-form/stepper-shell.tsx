'use client';
import { omitUndefined } from '../../lib/utils/omit-undefined';

// Copyright 2026 Redpanda Data, Inc.

import type React from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from '../button';
import { type DefineStepperProps, defineStepper } from '../stepper';
import { useAutoForm } from './context';
import type { ParsedField } from './core-types';
import { formSpacing } from './form-spacing';
import { filterFieldsByPaths, projectValuesToFields } from './helpers';
import { AutoFormFields } from './renderers';
import type { AutoFormSlotDescriptor } from './slots';
import { buildAutoFormTestId } from './test-ids';
import type { AutoFormStepConfig } from './types';

type ResolvedStep = AutoFormStepConfig & {
  fieldsForRender: ParsedField[];
  stepPayload: Record<string, unknown>;
};

interface StepperDefinition {
  description?: string;
  id: string;
  title: string;
}
type StepperDefinitions = readonly [StepperDefinition, ...StepperDefinition[]];
type StepperConfig = DefineStepperProps<StepperDefinitions>;
const STEPPER_CACHE_LIMIT = 50;
const stepperConfigCache = new Map<string, StepperConfig>();

function isNonEmpty<T>(items: T[]): items is [T, ...T[]] {
  return items.length > 0;
}

function getStepperConfig(visibleSteps: ResolvedStep[]): StepperConfig | null {
  if (visibleSteps.length === 0) {
    return null;
  }
  const definitions: StepperDefinition[] = visibleSteps.map(({ id, title, description }) => ({
    id,
    title,
    ...omitUndefined({ description }),
  }));
  if (!isNonEmpty(definitions)) {
    return null;
  }
  const cacheKey = JSON.stringify(definitions);
  const cached = stepperConfigCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const config = defineStepper(...definitions);
  if (stepperConfigCache.size >= STEPPER_CACHE_LIMIT) {
    const oldestKey = stepperConfigCache.keys().next().value;
    if (oldestKey !== undefined) {
      stepperConfigCache.delete(oldestKey);
    }
  }
  stepperConfigCache.set(cacheKey, config);
  return config;
}

export function AutoFormStepperShell({
  children,
  fields,
  slots,
  steps,
  withSubmit,
}: {
  children?: React.ReactNode | undefined;
  fields: ParsedField[];
  slots: readonly AutoFormSlotDescriptor[];
  steps: AutoFormStepConfig[];
  withSubmit: boolean;
}) {
  const { uiComponents, formValues, evaluateRules, testIdPrefix } = useAutoForm();
  const form = useFormContext<Record<string, unknown>>();
  const SubmitButtonComponent = uiComponents.SubmitButton;

  const visibleSteps: ResolvedStep[] = steps.flatMap((step) => {
    const fieldsForRender = filterFieldsByPaths(fields, step.fields);
    if (fieldsForRender.length === 0) {
      return [];
    }
    const stepPayload = projectValuesToFields(formValues, fieldsForRender);
    return evaluateRules(step.visibleWhen, stepPayload)
      ? [{ ...step, fieldsForRender, stepPayload } satisfies ResolvedStep]
      : [];
  });

  const stepperKey = visibleSteps.map((step) => step.id).join('|');
  const stepperConfig = getStepperConfig(visibleSteps);

  if (!(stepperConfig !== null && visibleSteps.length > 0)) {
    return (
      <>
        <AutoFormFields fields={fields} slots={slots} />
        {children}
      </>
    );
  }

  const { Stepper } = stepperConfig;
  return (
    <Stepper.Provider
      className={formSpacing.field}
      key={stepperKey}
      testId={buildAutoFormTestId(testIdPrefix, 'stepper')}
      variant="horizontal"
    >
      {({ methods }) => {
        const currentStep = visibleSteps.find((step) => step.id === methods.current.id) ?? visibleSteps[0];
        if (currentStep === undefined) {
          return null;
        }

        const completionSatisfied = evaluateRules(currentStep.completeWhen, currentStep.stepPayload);

        const blockingMessage = currentStep.completeWhen?.find(
          (rule) => !evaluateRules([rule], currentStep.stepPayload)
        )?.message;
        const submitAction =
          methods.isLast && withSubmit ? (
            <SubmitButtonComponent testId={buildAutoFormTestId(testIdPrefix, 'submit')}>Submit</SubmitButtonComponent>
          ) : null;

        const currentStepIndex = visibleSteps.findIndex((step) => step.id === currentStep.id);

        const handleStepClick = async (stepId: string, stepIndex: number) => {
          if (stepIndex <= currentStepIndex) {
            await methods.goTo(stepId);
            return;
          }
          const isValid = await form.trigger(currentStep.fields, { shouldTouch: true });
          if (isValid && completionSatisfied) {
            await methods.goTo(stepId);
          }
        };

        const reportNavigationError = (error: unknown) => {
          form.setError('root', {
            type: 'navigation',
            message: error instanceof Error ? error.message : 'Could not change form steps.',
          });
        };
        const handleNext = async () => {
          const isValid = await form.trigger(currentStep.fields, { shouldTouch: true });
          if (isValid && completionSatisfied) {
            await methods.next();
          }
        };

        return (
          <>
            <Stepper.Navigation testId={buildAutoFormTestId(testIdPrefix, 'stepper-navigation')}>
              {visibleSteps.map((step, stepIndex) => (
                <Stepper.Step
                  description={
                    (step.description ?? '') === '' ? null : (
                      <Stepper.Description>{step.description}</Stepper.Description>
                    )
                  }
                  key={step.id}
                  of={step.id}
                  onClick={() => {
                    handleStepClick(step.id, stepIndex).catch(reportNavigationError);
                  }}
                  testId={buildAutoFormTestId(testIdPrefix, `step-${step.id}`)}
                  title={<Stepper.Title>{step.title}</Stepper.Title>}
                />
              ))}
            </Stepper.Navigation>

            {methods.match(
              Object.fromEntries(
                visibleSteps.map((step) => [
                  step.id,
                  () => (
                    <Stepper.Panel className={formSpacing.field}>
                      <AutoFormFields fields={step.fieldsForRender} slots={slots} />
                    </Stepper.Panel>
                  ),
                ])
              )
            )}

            <div className="space-y-3">
              <Stepper.Controls>
                {methods.isFirst ? (
                  <div />
                ) : (
                  <Button
                    onClick={() => {
                      methods.prev().catch(reportNavigationError);
                    }}
                    testId={buildAutoFormTestId(testIdPrefix, 'previous')}
                    type="button"
                    variant="default"
                  >
                    Previous
                  </Button>
                )}

                {methods.isLast ? (
                  submitAction
                ) : (
                  <Button
                    disabled={!completionSatisfied}
                    onClick={() => {
                      handleNext().catch(reportNavigationError);
                    }}
                    testId={buildAutoFormTestId(testIdPrefix, 'next')}
                    type="button"
                  >
                    Next
                  </Button>
                )}
              </Stepper.Controls>

              {blockingMessage !== undefined && blockingMessage !== '' ? (
                <div className="text-body-sm text-destructive">{blockingMessage}</div>
              ) : null}
            </div>
            {children}
          </>
        );
      }}
    </Stepper.Provider>
  );
}
