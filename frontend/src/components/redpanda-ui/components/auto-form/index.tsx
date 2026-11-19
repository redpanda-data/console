'use client';

// Copyright 2026 Redpanda Data, Inc.

import React from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { TooltipProvider } from '../tooltip';
import { getProtoMessageUiConfig, PROTO_FORM_ROOT_ERROR_KEY } from '../../lib/protobuf-provider';
import { omitUndefined } from '../../lib/utils/omit-undefined';
import { AutoFormErrorBoundary } from './error-boundary';
import {
  ArrayElementWrapper,
  ArrayWrapper,
  ErrorMessage,
  FieldWrapper,
  Form,
  ObjectWrapper,
  SubmitButton,
} from './field-wrapper';
import { defaultFieldComponents } from './fields/built-ins';
import { deriveSimpleFields, getRootErrorMessage } from './helpers';
import { AutoFormModeShell } from './mode-shell';
import { normalizeProtoInitialValues } from './proto/conversion';
import { AutoFormFields } from './renderers';
import { AutoFormRootHeader } from './root-header';
import { AutoFormRuntimeProvider } from './runtime-provider';
import { mergeFieldOverrides, resolveSchema } from './schema';
import { type AutoFormSlotDescriptor, EMPTY_AUTO_FORM_SLOTS, validateAutoFormSlots } from './slots';
import { AutoFormStepperShell } from './stepper-shell';
import { AutoFormSubmissionContext, useAutoFormSubmit } from './submission';
import { buildAutoFormTestId, resolveAutoFormTestIdPrefix } from './test-ids';
import type { AutoFormMode, AutoFormProps, AutoFormStepConfig } from './types';
import { useAutoFormMode } from './use-auto-form-mode';
import { resolveStepConfig } from './utils/steps';

const noopOnSubmit = () => undefined;
const ShadcnUIComponents = {
  Form,
  FieldWrapper,
  ErrorMessage,
  SubmitButton,
  ObjectWrapper,
  ArrayWrapper,
  ArrayElementWrapper,
};

export { useAutoForm } from './context';
export { defaultRegistry } from './fields/built-ins';
export {
  type SecretSelectorAdapter,
  type SecretSelectorAdapterProps,
  SecretSelectorAdapterProvider,
} from './fields/secret-selector';
export { defaultClassifyField } from './helpers';
export { type FieldMatchContext, type FieldTypeDefinition, FieldTypeRegistry } from './registry';
export type { AutoFormSlotDescriptor } from './slots';
export { useAutoFormSubmitting } from './submission';
export type { AutoFormMode, AutoFormProps, AutoFormStepConfig, FieldTypes } from './types';

function renderModeContent({
  fields,
  steps,
  testIdPrefix,
  withSubmit,
  children,
  SubmitButtonComponent,
  slots,
}: {
  fields: ReturnType<typeof mergeFieldOverrides>;
  steps: AutoFormStepConfig[];
  testIdPrefix: string;
  withSubmit: boolean;
  children: React.ReactNode;
  slots: readonly AutoFormSlotDescriptor[];
  SubmitButtonComponent: React.ComponentType<{ children: React.ReactNode; testId?: string | undefined }>;
}) {
  if (steps.length > 0) {
    return (
      <AutoFormStepperShell fields={fields} slots={slots} steps={steps} withSubmit={withSubmit}>
        {children}
      </AutoFormStepperShell>
    );
  }

  return (
    <>
      <AutoFormFields fields={fields} slots={slots}>
        {children}
      </AutoFormFields>
      {withSubmit ? (
        <SubmitButtonComponent testId={buildAutoFormTestId(testIdPrefix, 'submit')}>Submit</SubmitButtonComponent>
      ) : null}
    </>
  );
}

const EMPTY_FORM_PROPS: React.ComponentProps<'form'> = {};

function AutoFormInner<T extends Record<string, unknown> = Record<string, unknown>>({
  schema,
  testId,
  onSubmit = noopOnSubmit,
  defaultValues,
  values,
  children,
  slots = EMPTY_AUTO_FORM_SLOTS,
  uiComponents,
  formComponents,
  withSubmit = false,
  formRef,
  formProps = EMPTY_FORM_PROPS,
  fieldConfig: fieldConfigOverrides,
  formOptions,
  resolver,
  modes,
  defaultMode,
  showSummary = false,
  renderSummary,
  fieldRegistry,
  dataProviders,
  classifyField,
  payloadSchema,
  stepper = false,
  steps,
  payloadBuilder,
  payloadParser,
  onFieldChange,
}: AutoFormProps<T>) {
  const testIdPrefix = resolveAutoFormTestIdPrefix(testId);
  const resolvedSchema = resolveSchema(schema, resolver);
  const advancedFields = mergeFieldOverrides(resolvedSchema.parsedSchema.fields, fieldConfigOverrides);
  validateAutoFormSlots(slots, advancedFields);
  const simpleFields = deriveSimpleFields(advancedFields, classifyField);
  const protoMessageUi =
    resolvedSchema.protoDesc === undefined ? undefined : getProtoMessageUiConfig(resolvedSchema.protoDesc);
  const protoSteps = protoMessageUi?.steps;
  const shouldUseStepper = Boolean(stepper || steps?.length);
  const resolvedSteps = shouldUseStepper ? resolveStepConfig(advancedFields, steps, protoSteps) : [];
  const mergedUiComponents = { ...ShadcnUIComponents, ...uiComponents };
  const mergedFormComponents = { ...defaultFieldComponents, ...formComponents };
  const providerDefaults = resolvedSchema.provider.getDefaultValues();
  const initialDefaultValues = {
    ...providerDefaults,
    ...(resolvedSchema.isProto && resolvedSchema.protoDesc !== undefined
      ? normalizeProtoInitialValues(resolvedSchema.protoDesc, defaultValues)
      : defaultValues),
  };
  const controlledValues =
    resolvedSchema.isProto && resolvedSchema.protoDesc !== undefined && values !== undefined
      ? normalizeProtoInitialValues(resolvedSchema.protoDesc, values)
      : values;

  const methods = useForm<Record<string, unknown>, unknown, T>(
    omitUndefined({
      ...formOptions,
      defaultValues: initialDefaultValues,
      resolver: resolvedSchema.resolver,
      values: controlledValues,
    })
  );
  const { handleSubmit, isSubmitting } = useAutoFormSubmit(methods, resolvedSchema, onSubmit);
  React.useImperativeHandle(formRef, () => methods, [methods]);

  const { availableModes, mode, handleModeChange } = useAutoFormMode(modes, defaultMode);

  const rootError =
    getRootErrorMessage(methods.formState.errors.root) ??
    getRootErrorMessage(methods.formState.errors[PROTO_FORM_ROOT_ERROR_KEY]);

  function renderFormForMode(targetMode: Exclude<AutoFormMode, 'json'>) {
    const fields = targetMode === 'simple' ? simpleFields : advancedFields;
    const content = renderModeContent({
      fields,
      steps: resolvedSteps,
      testIdPrefix,
      withSubmit,
      children,
      slots,
      SubmitButtonComponent: mergedUiComponents.SubmitButton,
    });
    return content;
  }

  return (
    <TooltipProvider>
      <FormProvider {...methods}>
        <AutoFormSubmissionContext value={isSubmitting}>
          <AutoFormRuntimeProvider<T>
            advancedFields={advancedFields}
            dataProviders={dataProviders}
            fieldRegistry={fieldRegistry}
            formComponents={mergedFormComponents}
            mode={mode}
            onFieldChange={onFieldChange}
            payloadBuilder={payloadBuilder}
            payloadParser={payloadParser}
            payloadSchema={payloadSchema}
            renderContent={(bag) => (
              <mergedUiComponents.Form onSubmit={handleSubmit} testId={testIdPrefix} {...formProps}>
                {rootError !== undefined && rootError !== '' ? (
                  <Alert variant="destructive">
                    <AlertTitle>Form validation failed</AlertTitle>
                    <AlertDescription className="whitespace-pre-wrap">{rootError}</AlertDescription>
                  </Alert>
                ) : null}

                <AutoFormRootHeader
                  description={protoMessageUi?.description}
                  testId={`${testIdPrefix}-root-header`}
                  title={protoMessageUi?.title}
                />

                <AutoFormModeShell
                  bestEffort={bag.payloadState.bestEffort}
                  jsonEditorError={bag.jsonEditorError}
                  jsonText={bag.jsonEditorText}
                  mode={mode}
                  modes={availableModes}
                  onFormatJson={bag.handleFormatJson}
                  onJsonTextChange={bag.handleJsonTextChange}
                  onModeChange={handleModeChange}
                  onResetJson={bag.handleResetJson}
                  payload={bag.payloadState.payload}
                  renderFormMode={renderFormForMode}
                  renderSummary={renderSummary}
                  showSummary={showSummary}
                  summaryContext={bag.summaryContext}
                  testIdPrefix={testIdPrefix}
                />
              </mergedUiComponents.Form>
            )}
            resolvedSchema={resolvedSchema}
            simpleFields={simpleFields}
            testIdPrefix={testIdPrefix}
            uiComponents={mergedUiComponents}
          >
            {null}
          </AutoFormRuntimeProvider>
        </AutoFormSubmissionContext>
      </FormProvider>
    </TooltipProvider>
  );
}

// Note: `schema` must be a stable reference, such as a module-level constant.
// Passing an inline `z.object({...})` will remount the form on every parent render.
export function AutoForm<T extends Record<string, unknown> = Record<string, unknown>>(props: AutoFormProps<T>) {
  return (
    <AutoFormErrorBoundary resetKey={props.schema} slotsKey={props.slots}>
      <AutoFormInner {...props} />
    </AutoFormErrorBoundary>
  );
}
