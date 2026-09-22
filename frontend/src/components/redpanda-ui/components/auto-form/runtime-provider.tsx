'use client';

// Copyright 2026 Redpanda Data, Inc.

import type { DescMessage } from '@bufbuild/protobuf';
import React from 'react';
import { type UseFormReturn, useFormContext, useWatch } from 'react-hook-form';

import { AutoFormContext, type AutoFormContextValue } from './context';
import type {
  AutoFormFieldComponents,
  AutoFormUIComponents,
  ParsedField,
  ParsedSchema,
  SchemaProvider,
} from './core-types';
import type { DataProviderRegistry } from './data-providers';
import { getFieldUiConfig, isRecord, isValidationSuccess } from './helpers';
import { protoFormValuesToPayload, protoPayloadToFormValues } from './proto';
import type { FieldTypeRegistry } from './registry';
import type { AutoFormMode, AutoFormPayloadBuilderContext, AutoFormStepConfig, AutoFormSummaryContext } from './types';
import { evaluateUiRules } from './ui-rules';
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
  dataProviders?: DataProviderRegistry;
  fieldRegistry?: FieldTypeRegistry;
  formComponents: AutoFormFieldComponents;
  mode: AutoFormMode;
  onFieldChange?: (
    fieldPath: string,
    value: unknown,
    form: UseFormReturn<Record<string, unknown>, unknown, T>
  ) => void | Promise<void>;
  payloadBuilder?: (values: Record<string, unknown>, context: AutoFormPayloadBuilderContext<T>) => unknown;
  payloadParser?: (
    payload: unknown,
    context: AutoFormPayloadBuilderContext<T>
  ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
  payloadSchema?: {
    safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: unknown[]; message: string }> } };
  };
  renderContent: (bag: PayloadBag<T>) => React.ReactNode;
  resolvedSchema: {
    provider: SchemaProvider<Record<string, unknown>>;
    parsedSchema: ParsedSchema;
    isProto: boolean;
    protoDesc?: DescMessage;
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
  if (!builder) {
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
    if (context.isProto && context.protoDesc) {
      payload = protoFormValuesToPayload(context.protoDesc, values);
      bestEffort = bestEffort || !validation.success;
    } else if (validation.success) {
      payload = validation.data;
    } else {
      payload = values;
      bestEffort = true;
    }
  }

  if (payloadSchema && payload !== undefined && !payloadSchema.safeParse(payload).success) {
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
  // The renderContent contract is an opaque render prop that receives callbacks
  // backed by a latest-request ref. Compiling across that boundary would let the
  // compiler treat those event callbacks as render-time ref reads.
  'use no memo';

  const deferredValues = React.useDeferredValue(watchedValues);

  const payloadContextBase = React.useMemo<AutoFormPayloadBuilderContext<T>>(
    () => ({
      form: methods,
      schema: resolvedSchema.parsedSchema,
      isProto: resolvedSchema.isProto,
      mode,
      simpleFields,
      advancedFields,
      ...(resolvedSchema.protoDesc ? { protoDesc: resolvedSchema.protoDesc } : {}),
    }),
    [
      advancedFields,
      methods,
      mode,
      resolvedSchema.isProto,
      resolvedSchema.parsedSchema,
      resolvedSchema.protoDesc,
      simpleFields,
    ]
  );

  const payloadState = React.useMemo(
    () =>
      createPayloadState({
        context: payloadContextBase,
        payloadBuilder,
        payloadSchema,
        provider: resolvedSchema.provider,
        values: deferredValues,
      }),
    [deferredValues, payloadBuilder, payloadContextBase, payloadSchema, resolvedSchema.provider]
  );

  const payloadText = React.useMemo(() => safeStringify(payloadState.payload), [payloadState.payload]);
  const [jsonEditorText, setJsonEditorText] = React.useState(payloadText);
  const [jsonEditorError, setJsonEditorError] = React.useState<string>();

  React.useEffect(() => {
    if (!jsonEditorError) {
      setJsonEditorText(payloadText);
    }
  }, [jsonEditorError, payloadText]);

  const applySeqRef = React.useRef(0);

  const applyPayloadToForm = React.useCallback(
    async (incoming: unknown) => {
      const seq = ++applySeqRef.current;
      try {
        let nextValues: Record<string, unknown> | undefined;

        if (payloadParser) {
          const parsed = payloadParser(incoming, payloadContextBase);
          nextValues = isPromiseLike(parsed) ? await parsed : parsed;
        } else if (resolvedSchema.isProto && resolvedSchema.protoDesc) {
          nextValues = protoPayloadToFormValues(resolvedSchema.protoDesc, incoming);
        } else if (isRecord(incoming)) {
          nextValues = incoming;
        }

        if (applySeqRef.current !== seq) {
          return;
        }

        if (!nextValues) {
          setJsonEditorError('AutoForm could not map this JSON payload back into the form.');
          return;
        }

        methods.reset(nextValues, { keepDefaultValues: true });
        setJsonEditorError(undefined);
      } catch (error) {
        if (applySeqRef.current !== seq) {
          return;
        }
        setJsonEditorError(error instanceof Error ? error.message : 'AutoForm could not apply this payload.');
      }
    },
    [methods, payloadContextBase, payloadParser, resolvedSchema.isProto, resolvedSchema.protoDesc]
  );

  const handleJsonTextChange = React.useCallback(
    async (value: string) => {
      setJsonEditorText(value);
      try {
        const parsed = JSON.parse(value);
        setJsonEditorError(undefined);
        await applyPayloadToForm(parsed);
      } catch (error) {
        setJsonEditorError(error instanceof Error ? error.message : 'Invalid JSON');
      }
    },
    [applyPayloadToForm]
  );

  const handleResetJson = React.useCallback(() => {
    setJsonEditorError(undefined);
    setJsonEditorText(payloadText);
  }, [payloadText]);

  const handleFormatJson = React.useCallback(async () => {
    try {
      const parsed = JSON.parse(jsonEditorText);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonEditorText(formatted);
      setJsonEditorError(undefined);
      await applyPayloadToForm(parsed);
    } catch (error) {
      setJsonEditorError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  }, [applyPayloadToForm, jsonEditorText]);

  const summaryContext = React.useMemo<AutoFormSummaryContext<T>>(
    () => ({
      ...payloadContextBase,
      payload: payloadState.payload,
      bestEffort: payloadState.bestEffort,
    }),
    [payloadContextBase, payloadState.bestEffort, payloadState.payload]
  );

  return (
    <>
      {renderContent({
        payloadState,
        jsonEditorText,
        jsonEditorError,
        payloadText,
        summaryContext,
        handleJsonTextChange,
        handleResetJson,
        handleFormatJson,
      })}
    </>
  );
}

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
  const methods = useFormContext<Record<string, unknown>>() as UseFormReturn<Record<string, unknown>, unknown, T>;
  const watchedValues = (useWatch({ control: methods.control }) as Record<string, unknown> | undefined) ?? {};

  const prevValuesRef = React.useRef<Record<string, unknown>>(watchedValues);

  React.useEffect(() => {
    // Only fires for root-level keys; nested changes surface as onFieldChange("address", ...) when the parent ref changes.
    if (!onFieldChange) {
      return;
    }
    const prev = prevValuesRef.current;
    for (const key of Object.keys(watchedValues)) {
      if (watchedValues[key] !== prev[key]) {
        Promise.resolve(onFieldChange(key, watchedValues[key], methods)).catch((error: unknown) => {
          globalThis.reportError(error);
        });
      }
    }
    prevValuesRef.current = { ...watchedValues };
  }, [watchedValues, onFieldChange, methods]);

  const contextValue = React.useMemo<AutoFormContextValue>(
    () => ({
      uiComponents,
      formComponents,
      formValues: watchedValues,
      evaluateRules: (rules: AutoFormStepConfig['visibleWhen'], fieldValue?: unknown) =>
        evaluateUiRules(rules, { form: watchedValues, thisValue: fieldValue }),
      getFieldUiConfig,
      testIdPrefix,
      fieldRegistry,
      dataProviders,
    }),
    [dataProviders, fieldRegistry, formComponents, uiComponents, testIdPrefix, watchedValues]
  );

  return (
    <AutoFormContext.Provider value={contextValue}>
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
