'use client';

import React from 'react';
import { FormProvider, type Resolver, type UseFormReturn, useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '../alert';
import { TooltipProvider } from '../tooltip';
import { Heading, Text } from '../typography';

import type { SchemaProvider } from './core-types';
import {
  ArrayElementWrapper,
  ArrayWrapper,
  ErrorMessage,
  FieldWrapper,
  Form,
  ObjectWrapper,
  SubmitButton,
} from './field-wrapper';
import { AutoFormFieldComponentRegistry } from './fields';
import { applyValidationErrors, deriveSimpleFields, getRootErrorMessage } from './helpers';
import { AutoFormModeShell } from './mode-shell';
import { getProtoMessageUiConfig, PROTO_FORM_ROOT_ERROR_KEY } from './proto';
import { AutoFormFields } from './renderers';
import { AutoFormRuntimeProvider } from './runtime-provider';
import { mergeFieldOverrides, normalizeProtoInitialValues, resolveSchema } from './schema';
import { AutoFormStepperShell } from './stepper-shell';
import { buildAutoFormTestId, resolveAutoFormTestIdPrefix } from './test-ids';
import type { AutoFormMode, AutoFormProps, AutoFormStepConfig } from './types';
import { normalizeModes, resolveInitialMode } from './utils/modes';
import { resolveStepConfig } from './utils/steps';

const noopOnSubmit = async () => undefined;
const ShadcnUIComponents = {
  Form,
  FieldWrapper,
  ErrorMessage,
  SubmitButton,
  ObjectWrapper,
  ArrayWrapper,
  ArrayElementWrapper,
};

export const ShadcnAutoFormFieldComponents = AutoFormFieldComponentRegistry;

export { useAutoForm } from './context';
export { defaultRegistry } from './fields';
export {
  type SecretSelectorAdapter,
  type SecretSelectorAdapterProps,
  SecretSelectorAdapterProvider,
} from './fields/secret-selector';
export { defaultClassifyField } from './helpers';
export { type FieldMatchContext, type FieldTypeDefinition, FieldTypeRegistry } from './registry';
export { AutoFormSlot } from './slot';
export type { AutoFormMode, AutoFormProps, AutoFormStepConfig, FieldTypes } from './types';

function renderModeContent({
  fields,
  steps,
  testIdPrefix,
  withSubmit,
  children,
  SubmitButtonComponent,
}: {
  fields: ReturnType<typeof mergeFieldOverrides>;
  steps: AutoFormStepConfig[];
  testIdPrefix: string;
  withSubmit: boolean;
  children: React.ReactNode;
  SubmitButtonComponent: React.ComponentType<{ children: React.ReactNode; testId?: string }>;
}) {
  if (steps.length > 0) {
    return (
      <AutoFormStepperShell fields={fields} steps={steps} withSubmit={withSubmit}>
        {children}
      </AutoFormStepperShell>
    );
  }

  return (
    <>
      <AutoFormFields fields={fields}>{children}</AutoFormFields>
      {withSubmit ? (
        <SubmitButtonComponent testId={buildAutoFormTestId(testIdPrefix, 'submit')}>Submit</SubmitButtonComponent>
      ) : null}
    </>
  );
}

function AutoFormInner<T extends Record<string, unknown> = Record<string, unknown>>({
  schema,
  testId,
  onSubmit = noopOnSubmit,
  defaultValues,
  values,
  children,
  uiComponents,
  formComponents,
  withSubmit = false,
  onFormInit,
  formProps = {},
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
  const testIdPrefix = React.useMemo(() => resolveAutoFormTestIdPrefix(testId), [testId]);
  const resolvedSchema = React.useMemo(() => resolveSchema(schema, resolver), [schema, resolver]);
  const onFormInitRef = React.useRef(onFormInit);

  React.useEffect(() => {
    onFormInitRef.current = onFormInit;
  }, [onFormInit]);

  const advancedFields = React.useMemo(
    () => mergeFieldOverrides(resolvedSchema.parsedSchema.fields, fieldConfigOverrides),
    [fieldConfigOverrides, resolvedSchema.parsedSchema.fields]
  );

  const simpleFields = React.useMemo(
    () => deriveSimpleFields(advancedFields, classifyField),
    [advancedFields, classifyField]
  );
  const protoMessageUi = React.useMemo(
    () => (resolvedSchema.protoDesc ? getProtoMessageUiConfig(resolvedSchema.protoDesc) : undefined),
    [resolvedSchema.protoDesc]
  );
  const protoSteps = protoMessageUi?.steps;
  const shouldUseStepper = Boolean(stepper || steps?.length);
  const resolvedSteps = React.useMemo(
    () => (shouldUseStepper ? resolveStepConfig(advancedFields, steps, protoSteps) : []),
    [advancedFields, protoSteps, shouldUseStepper, steps]
  );

  const mergedUiComponents = React.useMemo(() => ({ ...ShadcnUIComponents, ...uiComponents }), [uiComponents]);
  const mergedFormComponents = React.useMemo(
    () => ({ ...ShadcnAutoFormFieldComponents, ...formComponents }),
    [formComponents]
  );

  const initialDefaultValues = React.useMemo(() => {
    const providerDefaults = resolvedSchema.provider.getDefaultValues();
    if (resolvedSchema.isProto && resolvedSchema.protoDesc) {
      return {
        ...providerDefaults,
        ...(normalizeProtoInitialValues(resolvedSchema.protoDesc, defaultValues) ?? {}),
      };
    }
    return {
      ...providerDefaults,
      ...(defaultValues ?? {}),
    };
  }, [defaultValues, resolvedSchema.isProto, resolvedSchema.protoDesc, resolvedSchema.provider]);

  const controlledValues = React.useMemo(() => {
    if (!values) {
      return;
    }
    if (resolvedSchema.isProto && resolvedSchema.protoDesc) {
      return normalizeProtoInitialValues(resolvedSchema.protoDesc, values);
    }
    return values;
  }, [resolvedSchema.isProto, resolvedSchema.protoDesc, values]);

  const methods = useForm<Record<string, unknown>, unknown, T>({
    ...(formOptions ?? {}),
    defaultValues: initialDefaultValues,
    resolver: resolvedSchema.resolver as Resolver<Record<string, unknown>, unknown, T> | undefined,
    values: controlledValues,
  });
  const methodsRef = React.useRef(methods);

  React.useEffect(() => {
    methodsRef.current = methods;
  }, [methods]);

  React.useEffect(() => {
    onFormInitRef.current?.(methodsRef.current as UseFormReturn<Record<string, unknown>, unknown, T>);
  }, []);

  const availableModes = React.useMemo(() => normalizeModes(modes), [modes]);
  const preferredMode = React.useMemo(
    () => resolveInitialMode(availableModes, defaultMode),
    [availableModes, defaultMode]
  );
  const [mode, setMode] = React.useState<AutoFormMode>(preferredMode);
  const previousDefaultMode = React.useRef(defaultMode);

  React.useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode(preferredMode);
      previousDefaultMode.current = defaultMode;
      return;
    }

    if (previousDefaultMode.current !== defaultMode) {
      previousDefaultMode.current = defaultMode;
      if (defaultMode && availableModes.includes(defaultMode)) {
        setMode(defaultMode);
      }
    }
  }, [availableModes, defaultMode, mode, preferredMode]);

  const validateWithProvider = React.useCallback(
    async (
      submittedValues: Record<string, unknown>
    ): Promise<ReturnType<SchemaProvider<Record<string, unknown>>['validateSchema']>> => {
      try {
        return await Promise.resolve(resolvedSchema.provider.validateSchema(submittedValues));
      } catch (error) {
        return {
          success: false,
          errors: [
            {
              path: [] as Array<string | number>,
              message: error instanceof Error ? error.message : 'Failed to validate form values.',
            },
          ],
        };
      }
    },
    [resolvedSchema.provider]
  );

  const handleValidSubmit = React.useCallback(
    async (submittedValues: T) => {
      methods.clearErrors(['root', PROTO_FORM_ROOT_ERROR_KEY]);
      try {
        await onSubmit(submittedValues, methods as UseFormReturn<Record<string, unknown>, unknown, T>);
      } catch (error) {
        methods.setError('root', {
          type: 'submit',
          message: error instanceof Error ? error.message : 'Submission failed.',
        });
      }
    },
    [methods, onSubmit]
  );

  const handleProviderSubmit = React.useCallback(
    async (submittedValues: Record<string, unknown>) => {
      const validationResult = await validateWithProvider(submittedValues);
      if (validationResult.success) {
        try {
          await onSubmit(validationResult.data as T, methods as UseFormReturn<Record<string, unknown>, unknown, T>);
        } catch (error) {
          methods.setError('root', {
            type: 'submit',
            message: error instanceof Error ? error.message : 'Submission failed.',
          });
        }
        return;
      }
      applyValidationErrors(methods, validationResult.errors);
    },
    [methods, onSubmit, validateWithProvider]
  );

  const rootError =
    getRootErrorMessage(methods.formState.errors.root) ||
    getRootErrorMessage((methods.formState.errors as Record<string, unknown>)[PROTO_FORM_ROOT_ERROR_KEY]);

  const renderFormForMode = React.useCallback(
    (targetMode: Exclude<AutoFormMode, 'json'>) => {
      const fields = targetMode === 'simple' ? simpleFields : advancedFields;
      return renderModeContent({
        fields,
        steps: resolvedSteps,
        testIdPrefix,
        withSubmit,
        children,
        SubmitButtonComponent: mergedUiComponents.SubmitButton as React.ComponentType<{
          children: React.ReactNode;
          testId?: string;
        }>,
      });
    },
    [advancedFields, children, mergedUiComponents.SubmitButton, resolvedSteps, simpleFields, testIdPrefix, withSubmit]
  );

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={0}>
      <FormProvider {...methods}>
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
            <mergedUiComponents.Form
              onSubmit={methods.handleSubmit(resolvedSchema.resolver ? handleValidSubmit : handleProviderSubmit)}
              testId={testIdPrefix}
              {...formProps}
            >
              {rootError ? (
                <Alert variant="destructive">
                  <AlertTitle>Form validation failed</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">{rootError}</AlertDescription>
                </Alert>
              ) : null}

              {protoMessageUi?.title || protoMessageUi?.description ? (
                <header
                  className="space-y-1 border-border/60 border-b pb-4"
                  data-testid={`${testIdPrefix}-root-header`}
                >
                  {protoMessageUi.title ? <Heading level={2}>{protoMessageUi.title}</Heading> : null}
                  {protoMessageUi.description ? (
                    <Text className="text-muted-foreground" variant="small">
                      {protoMessageUi.description}
                    </Text>
                  ) : null}
                </header>
              ) : null}

              <AutoFormModeShell
                bestEffort={bag.payloadState.bestEffort}
                jsonEditorError={bag.jsonEditorError}
                jsonText={bag.jsonEditorText}
                mode={mode}
                modes={availableModes}
                onFormatJson={bag.handleFormatJson}
                onJsonTextChange={bag.handleJsonTextChange}
                onModeChange={setMode}
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
      </FormProvider>
    </TooltipProvider>
  );
}

type AutoFormErrorBoundaryState = { error: Error | null };

class AutoFormErrorBoundary extends React.Component<{ children: React.ReactNode }, AutoFormErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): AutoFormErrorBoundaryState {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <AlertTitle>AutoForm failed to render</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{this.state.error.message}</AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

// Note: `schema` must be a stable reference (module-level constant or useMemo).
// Passing an inline `z.object({...})` will remount the form on every parent render.
export function AutoForm<T extends Record<string, unknown> = Record<string, unknown>>(props: AutoFormProps<T>) {
  const schemaRef = React.useRef(props.schema);
  const [schemaKey, setSchemaKey] = React.useState(0);
  if (schemaRef.current !== props.schema) {
    schemaRef.current = props.schema;
    setSchemaKey((k) => k + 1);
  }
  return (
    <AutoFormErrorBoundary key={schemaKey}>
      <AutoFormInner {...props} />
    </AutoFormErrorBoundary>
  );
}
