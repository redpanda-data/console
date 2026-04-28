'use client';

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

type PayloadBag<T extends Record<string, unknown>> = {
  payloadState: { bestEffort: boolean; payload: unknown };
  jsonEditorText: string;
  jsonEditorError: string | undefined;
  payloadText: string;
  summaryContext: AutoFormSummaryContext<T>;
  handleJsonTextChange: (value: string) => void;
  handleResetJson: () => void;
  handleFormatJson: () => void;
};

type AutoFormRuntimeProviderProps<T extends Record<string, unknown>> = {
  children: React.ReactNode;
  uiComponents: AutoFormUIComponents;
  formComponents: AutoFormFieldComponents;
  testIdPrefix: string;
  fieldRegistry?: FieldTypeRegistry;
  dataProviders?: DataProviderRegistry;
  resolvedSchema: {
    provider: SchemaProvider<Record<string, unknown>>;
    parsedSchema: ParsedSchema;
    isProto: boolean;
    protoDesc?: DescMessage;
    resolver?: unknown;
  };
  mode: AutoFormMode;
  simpleFields: ParsedField[];
  advancedFields: ParsedField[];
  payloadBuilder?: (values: Record<string, unknown>, context: AutoFormPayloadBuilderContext<T>) => unknown;
  payloadParser?: (
    payload: unknown,
    context: AutoFormPayloadBuilderContext<T>
  ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
  payloadSchema?: {
    safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: unknown[]; message: string }> } };
  };
  renderContent: (bag: PayloadBag<T>) => React.ReactNode;
  onFieldChange?: (
    fieldPath: string,
    value: unknown,
    form: UseFormReturn<Record<string, unknown>, unknown, T>
  ) => void | Promise<void>;
};

// ---------------------------------------------------------------------------
// AutoFormPayloadController — leaf component that owns payload/JSON state.
// Uses useDeferredValue so expensive payload computation (SchemaProvider
// validation, proto conversion, payloadBuilder) doesn't block typing on large forms.
// ---------------------------------------------------------------------------

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

  const payloadContextBase = React.useMemo(
    () => ({
      form: methods,
      schema: resolvedSchema.parsedSchema,
      isProto: resolvedSchema.isProto,
      protoDesc: resolvedSchema.protoDesc,
      mode,
      simpleFields,
      advancedFields,
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

  const payloadState = React.useMemo(() => {
    let validationSuccess = false;
    let validatedData: unknown;
    let bestEffort = false;

    try {
      const validationResult = resolvedSchema.provider.validateSchema(deferredValues as never);
      if (isPromiseLike(validationResult)) {
        bestEffort = true;
      } else if (isValidationSuccess(validationResult)) {
        validationSuccess = true;
        validatedData = validationResult.data;
      } else {
        bestEffort = true;
      }
    } catch {
      bestEffort = true;
    }

    let payload: unknown;

    if (payloadBuilder) {
      try {
        payload = payloadBuilder(deferredValues, payloadContextBase as AutoFormPayloadBuilderContext<T>);
      } catch (error) {
        console.warn('[AutoForm] payloadBuilder threw:', error);
        bestEffort = true;
      }
    }

    if (payload === undefined) {
      if (resolvedSchema.isProto && resolvedSchema.protoDesc) {
        payload = protoFormValuesToPayload(resolvedSchema.protoDesc, deferredValues);
        bestEffort ||= !validationSuccess;
      } else if (validationSuccess) {
        payload = validatedData;
      } else {
        payload = deferredValues;
        bestEffort = true;
      }
    }

    if (payloadSchema && payload !== undefined) {
      const validation = payloadSchema.safeParse(payload);
      if (!validation.success && validation.error) {
        console.warn(
          '[AutoForm] payloadSchema validation failed:',
          validation.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ')
        );
      }
    }

    return { bestEffort, payload };
  }, [
    deferredValues,
    payloadBuilder,
    payloadContextBase,
    payloadSchema,
    resolvedSchema.isProto,
    resolvedSchema.protoDesc,
    resolvedSchema.provider,
  ]);

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
          const parsed = payloadParser(incoming, payloadContextBase as AutoFormPayloadBuilderContext<T>);
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
    (value: string) => {
      setJsonEditorText(value);
      try {
        const parsed = JSON.parse(value);
        setJsonEditorError(undefined);
        void applyPayloadToForm(parsed);
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

  const handleFormatJson = React.useCallback(() => {
    try {
      const parsed = JSON.parse(jsonEditorText);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonEditorText(formatted);
      setJsonEditorError(undefined);
      void applyPayloadToForm(parsed);
    } catch (error) {
      setJsonEditorError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  }, [applyPayloadToForm, jsonEditorText]);

  const summaryContext = React.useMemo<AutoFormSummaryContext<T>>(
    () => ({
      ...(payloadContextBase as AutoFormPayloadBuilderContext<T>),
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

// ---------------------------------------------------------------------------
// AutoFormRuntimeProvider — provides the AutoFormContext with live form values.
// Payload computation is delegated to the AutoFormPayloadController child.
// ---------------------------------------------------------------------------

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
    // Note: only fires for root-level field keys. Nested changes (e.g. address.city)
    // fire as onFieldChange("address", ...) when the parent object reference changes.
    if (!onFieldChange) return;
    const prev = prevValuesRef.current;
    for (const key of Object.keys(watchedValues)) {
      if (watchedValues[key] !== prev[key]) {
        void onFieldChange(key, watchedValues[key], methods);
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
