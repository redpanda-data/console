'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';

import { useAutoFormRenderContext, useAutoFormRuntimeContext } from './context';
import type { ParsedField } from './core-types';
import { formSpacing } from './form-spacing';
import { filterFieldsByPaths, projectValuesToFields } from './helpers';
import { AutoFormFields } from './renderers';
import { buildAutoFormTestId } from './test-ids';
import type { AutoFormStepConfig } from './types';
import { Button } from '../button';
import { defineStepper } from '../stepper';
import { Text } from '../typography';

type ResolvedStep = AutoFormStepConfig & {
  fieldsForRender: ParsedField[];
  stepPayload: Record<string, unknown>;
};

export function AutoFormStepperShell({
  children,
  fields,
  steps,
  withSubmit,
}: {
  children?: React.ReactNode;
  fields: ParsedField[];
  steps: AutoFormStepConfig[];
  withSubmit: boolean;
}) {
  const { uiComponents } = useAutoFormRenderContext();
  const { formValues, evaluateRules, testIdPrefix } = useAutoFormRuntimeContext();
  const form = useFormContext<Record<string, unknown>>();
  const SubmitButtonComponent = uiComponents.SubmitButton as React.ComponentType<{
    children: React.ReactNode;
    testId?: string;
  }>;

  const visibleSteps = React.useMemo<ResolvedStep[]>(() => {
    return steps
      .map((step) => {
        const fieldsForRender = filterFieldsByPaths(fields, step.fields);
        const stepPayload = projectValuesToFields(formValues, fieldsForRender);

        return {
          ...step,
          fieldsForRender,
          stepPayload,
        } satisfies ResolvedStep;
      })
      .filter((step) => step.fieldsForRender.length > 0)
      .filter((step) => evaluateRules(step.visibleWhen, step.stepPayload));
  }, [evaluateRules, fields, formValues, steps]);

  const stepperKey = visibleSteps.map((step) => step.id).join('|');
  const stepperDefinitionKey = visibleSteps
    .map((step) => `${step.id}:${step.title}:${step.description ?? ''}`)
    .join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: we intentionally key off step metadata only so the stepper instance stays stable while form state changes.
  const stepperConfig = React.useMemo(() => {
    if (!visibleSteps.length) {
      return null;
    }

    return defineStepper(
      ...(visibleSteps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description,
      })) as [
        { id: string; title: string; description?: string },
        ...Array<{ id: string; title: string; description?: string }>,
      ])
    );
  }, [stepperDefinitionKey]);

  if (!(stepperConfig && visibleSteps.length > 0)) {
    return (
      <>
        <AutoFormFields fields={fields} />
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
        if (!currentStep) {
          return null;
        }

        const completionSatisfied = currentStep.completeWhen?.length
          ? evaluateRules(currentStep.completeWhen, currentStep.stepPayload)
          : true;

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
            methods.goTo(stepId as never);
            return;
          }
          const isValid = await form.trigger(currentStep.fields);
          if (isValid && completionSatisfied) {
            methods.goTo(stepId as never);
          }
        };

        return (
          <>
            <Stepper.Navigation testId={buildAutoFormTestId(testIdPrefix, 'stepper-navigation')}>
              {visibleSteps.map((step, stepIndex) => (
                <Stepper.Step
                  key={step.id}
                  of={step.id as never}
                  onClick={() => handleStepClick(step.id, stepIndex)}
                  testId={buildAutoFormTestId(testIdPrefix, `step-${step.id}`)}
                >
                  <Stepper.Title>{step.title}</Stepper.Title>
                  {step.description ? <Stepper.Description>{step.description}</Stepper.Description> : null}
                </Stepper.Step>
              ))}
            </Stepper.Navigation>

            {methods.switch(
              Object.fromEntries(
                visibleSteps.map((step) => [
                  step.id,
                  () => (
                    <Stepper.Panel className={formSpacing.field}>
                      <AutoFormFields fields={step.fieldsForRender} />
                    </Stepper.Panel>
                  ),
                ])
              ) as never
            )}

            <div className="space-y-3">
              <Stepper.Controls>
                {methods.isFirst ? (
                  <div />
                ) : (
                  <Button
                    onClick={methods.prev}
                    testId={buildAutoFormTestId(testIdPrefix, 'previous')}
                    type="button"
                    variant="secondary"
                  >
                    Previous
                  </Button>
                )}

                {methods.isLast ? (
                  submitAction
                ) : (
                  <Button
                    disabled={!completionSatisfied}
                    onClick={async () => {
                      const isValid = await form.trigger(currentStep.fields);
                      if (isValid && completionSatisfied) {
                        methods.next();
                      }
                    }}
                    testId={buildAutoFormTestId(testIdPrefix, 'next')}
                    type="button"
                  >
                    Next
                  </Button>
                )}
              </Stepper.Controls>

              {blockingMessage ? (
                <Text className="text-destructive" variant="small">
                  {blockingMessage}
                </Text>
              ) : null}
            </div>
            {children}
          </>
        );
      }}
    </Stepper.Provider>
  );
}
