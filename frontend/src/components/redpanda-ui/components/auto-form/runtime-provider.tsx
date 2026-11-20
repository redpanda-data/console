'use client';

// Copyright 2026 Redpanda Data, Inc.

import type { DescMessage } from '@bufbuild/protobuf';
import React from 'react';
import { type UseFormReturn, useFormContext, useWatch } from 'react-hook-form';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { protoFormValuesToPayload } from '../../lib/protobuf-provider/form-values';
import { AutoFormContext, type AutoFormContextValue } from './context';
import type {
  AutoFormFieldComponents,
  AutoFormUIComponents,
  ParsedField,
  ParsedSchema,
  SchemaProvider,
} from './core-types';
import type { DataProviderRegistry } from './data-providers';
import { isValidationSuccess } from './helpers';
import type { FieldTypeRegistry } from './registry';
import type { AutoFormMode, AutoFormPayloadBuilderContext, AutoFormStepConfig, AutoFormSummaryContext } from './types';
import { getFieldUiConfig } from './ui-config';
import { evaluateUiRules } from './ui-rules';
import { usePayloadEditor } from './use-payload-editor';
import { isPromiseLike, safeStringify } from './utils/serialization';

interface PayloadBag<T extends Record<string, unknown>> {
  handleFormatJson: () => void;
  handleJsonTextChange: (value: string) => void;
  handleResetJson: () => void;
  jsonEditorError: string | undefined;
  jsonEditorText: string;
  payloadState: { bestEffort: boolean; payload: unknown };
  payloadText: string;
  summaryContext: AutoFormSummaryContext<T>;
}

interface AutoFormRuntimeProviderProps<T extends Record<string, unknown>> {
  advancedFields: ParsedField[];
  children: React.ReactNode;
  dataProviders?: DataProviderRegistry | undefined;
  fieldRegistry?: FieldTypeRegistry | undefined;
  formComponents: AutoFormFieldComponents;
  mode: AutoFormMode;
  onFieldChange?:
    | ((
        fieldPath: string,
        value: unknown,
        form: UseFormReturn<Record<string, unknown>, unknown, T>
      ) => void | Promise<void>)
    | undefined;
  payloadBuilder?:
    | ((values: Record<string, unknown>, context: AutoFormPayloadBuilderContext<T>) => unknown)
    | undefined;
  payloadParser?:
    | ((
        payload: unknown,
        context: AutoFormPayloadBuilderContext<T>
      ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>)
    | undefined;
  payloadSchema?:
    | {
        safeParse: (data: unknown) => {
          success: boolean;
          error?: { issues: Array<{ path: unknown[]; message: string }> } | undefined;
        };
      }
    | undefined;
  renderContent: (bag: PayloadBag<T>) => React.ReactNode;
  resolvedSchema: {
    provider: SchemaProvider;
    parsedSchema: ParsedSchema;
    isProto: boolean;
    protoDesc?: DescMessage | undefined;
    resolver?: unknown;
  };
  simpleFields: ParsedField[];
  testIdPrefix: string;
  uiComponents: AutoFormUIComponents;
}

interface RuntimeFormValues {
  [field: string]: unknown;
}

interface PayloadValidationResult {
  bestEffort: boolean;
  data: unknown;
  success: boolean;
}

function validatePayloadValues(
  provider: SchemaProvider<RuntimeFormValues>,
  values: RuntimeFormValues
): PayloadValidationResult {
  try {
    const validation = provider.validateSchema(values);
    if (isPromiseLike(validation) || !isValidationSuccess(validation)) {
      return { bestEffort: true, data: undefined, success: false };
    }
    return { bestEffort: false, data: validation.data, success: true };
  } catch {
    return { bestEffort: true, data: undefined, success: false };
  }
}

function buildCustomPayload<T extends RuntimeFormValues>(
  builder: AutoFormRuntimeProviderProps<T>['payloadBuilder'],
  values: RuntimeFormValues,
  context: AutoFormPayloadBuilderContext<T>
): { failed: boolean; payload: unknown } {
  if (builder === undefined) {
    return { failed: false, payload: undefined };
  }
  try {
    return { failed: false, payload: builder(values, context) };
  } catch {
    return { failed: true, payload: undefined };
  }
}

function createPayloadState<T extends RuntimeFormValues>({
  context,
  payloadBuilder,
  payloadSchema,
  provider,
  values,
}: {
  context: AutoFormPayloadBuilderContext<T>;
  payloadBuilder: AutoFormRuntimeProviderProps<T>['payloadBuilder'];
  payloadSchema: AutoFormRuntimeProviderProps<T>['payloadSchema'];
  provider: SchemaProvider<RuntimeFormValues>;
  values: RuntimeFormValues;
}): { bestEffort: boolean; payload: unknown } {
  const validation = validatePayloadValues(provider, values);
  const customPayload = buildCustomPayload(payloadBuilder, values, context);
  let bestEffort = validation.bestEffort || customPayload.failed;
  let { payload } = customPayload;

  if (payload === undefined) {
    if (context.isProto && context.protoDesc !== undefined) {
      payload = protoFormValuesToPayload(context.protoDesc, values);
      bestEffort = bestEffort || !validation.success;
    } else if (validation.success) {
      payload = validation.data;
    } else {
      payload = values;
      bestEffort = true;
    }
  }

  if (payloadSchema !== undefined && payload !== undefined && !payloadSchema.safeParse(payload).success) {
    bestEffort = true;
  }

  return { bestEffort, payload };
}

// useDeferredValue so expensive payload computation (validation, proto conversion,
// payloadBuilder) doesn't block typing on large forms.
function AutoFormPayloadController<T extends Record<string, unknown>>({
  watchedValues,
  methods,
  resolvedSchema,
  mode,
  simpleFields,
  advancedFields,
  payloadBuilder,
  payloadParser,
  payloadSchema,
  renderContent,
}: {
  watchedValues: Record<string, unknown>;
  methods: UseFormReturn<Record<string, unknown>, unknown, T>;
  resolvedSchema: AutoFormRuntimeProviderProps<T>['resolvedSchema'];
  mode: AutoFormMode;
  simpleFields: ParsedField[];
  advancedFields: ParsedField[];
  payloadBuilder: AutoFormRuntimeProviderProps<T>['payloadBuilder'];
  payloadParser: AutoFormRuntimeProviderProps<T>['payloadParser'];
  payloadSchema: AutoFormRuntimeProviderProps<T>['payloadSchema'];
  renderContent: AutoFormRuntimeProviderProps<T>['renderContent'];
}) {
  const deferredValues = React.useDeferredValue(watchedValues);

  const payloadContextBase: AutoFormPayloadBuilderContext<T> = {
    form: methods,
    schema: resolvedSchema.parsedSchema,
    isProto: resolvedSchema.isProto,
    mode,
    simpleFields,
    advancedFields,
    ...(resolvedSchema.protoDesc === undefined ? {} : { protoDesc: resolvedSchema.protoDesc }),
  };
  const payloadState = createPayloadState({
    context: payloadContextBase,
    payloadBuilder,
    payloadSchema,
    provider: resolvedSchema.provider,
    values: deferredValues,
  });
  const payloadText = safeStringify(payloadState.payload);
  const editor = usePayloadEditor({
    context: payloadContextBase,
    parser: payloadParser,
    payloadText,
    protoDesc: resolvedSchema.isProto ? resolvedSchema.protoDesc : undefined,
  });
  const summaryContext: AutoFormSummaryContext<T> = {
    ...payloadContextBase,
    payload: payloadState.payload,
    bestEffort: payloadState.bestEffort,
  };

  return renderContent({ ...editor, payloadState, payloadText, summaryContext });
}

const EMPTY_FORM_VALUES: Record<string, unknown> = {};

export function AutoFormRuntimeProvider<T extends Record<string, unknown>>({
  children: _children,
  uiComponents,
  formComponents,
  testIdPrefix,
  fieldRegistry,
  dataProviders,
  resolvedSchema,
  mode,
  simpleFields,
  advancedFields,
  payloadBuilder,
  payloadParser,
  payloadSchema,
  renderContent,
  onFieldChange,
}: AutoFormRuntimeProviderProps<T>) {
  const methods = useFormContext<Record<string, unknown>, unknown, T>();
  const watchedValues =
    (useWatch({ control: methods.control }) as Record<string, unknown> | undefined) ?? EMPTY_FORM_VALUES;

  const prevValuesRef = React.useRef<Record<string, unknown>>(watchedValues);
  const [fieldChangeErrors, setFieldChangeErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Only fires for root-level keys; nested changes surface as onFieldChange("address", ...) when the parent ref changes.
    if (onFieldChange === undefined) {
      return;
    }
    const prev = prevValuesRef.current;
    for (const key of Object.keys(watchedValues)) {
      if (watchedValues[key] !== prev[key]) {
        Promise.resolve()
          .then(() => onFieldChange(key, watchedValues[key], methods))
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'A field update callback failed.';
            setFieldChangeErrors((current) => ({ ...current, [key]: message }));
          });
      }
    }
    prevValuesRef.current = { ...watchedValues };
  }, [watchedValues, onFieldChange, methods]);

  const contextValue: AutoFormContextValue = {
    uiComponents,
    formComponents,
    formValues: watchedValues,
    evaluateRules: (rules: AutoFormStepConfig['visibleWhen'], fieldValue?: unknown) =>
      evaluateUiRules(rules, { form: watchedValues, thisValue: fieldValue }),
    getFieldUiConfig,
    testIdPrefix,
    fieldRegistry,
    dataProviders,
  };

  return (
    <AutoFormContext.Provider value={contextValue}>
      {Object.keys(fieldChangeErrors).length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Field update failed</AlertTitle>
          <AlertDescription>
            <ul>
              {Object.entries(fieldChangeErrors).map(([path, message]) => (
                <li key={path}>
                  {path}: {message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <AutoFormPayloadController<T>
        advancedFields={advancedFields}
        methods={methods}
        mode={mode}
        payloadBuilder={payloadBuilder}
        payloadParser={payloadParser}
        payloadSchema={payloadSchema}
        renderContent={renderContent}
        resolvedSchema={resolvedSchema}
        simpleFields={simpleFields}
        watchedValues={watchedValues}
      />
    </AutoFormContext.Provider>
  );
}
