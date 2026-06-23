import type { DescMessage } from '@bufbuild/protobuf';
import type { ReactNode } from 'react';
import type { Resolver, UseFormProps, UseFormReturn } from 'react-hook-form';

import type {
  AutoFormFieldComponents,
  AutoFormUIComponents,
  FieldConfig,
  ParsedField,
  ParsedSchema,
  SchemaProvider,
} from './core-types';
import type { ProtoFieldRenderType, ProtoStepConfig, ProtoUiRule } from './proto';
import type { FieldTypeRegistry } from './registry';

export type AutoFormMode = 'simple' | 'advanced' | 'json';

export type AutoFormOptionItem = {
  value: string;
  label?: ReactNode;
  icon?: ReactNode;
};

export type AutoFormOptionGroup = {
  label?: ReactNode;
  options: AutoFormOptionItem[];
};

export type FieldTypes = ProtoFieldRenderType | 'date' | 'slider';

export type RenderFieldConfig = FieldConfig<FieldTypes, Record<string, unknown>>;
export type FieldConfigMap = Record<string, RenderFieldConfig>;
export type AutoFormSchemaInput<T extends Record<string, unknown>> = SchemaProvider<T> | DescMessage;

export type AutoFormUiRule = ProtoUiRule;

export type AutoFormStepConfig = ProtoStepConfig;

export type ResolvedSchema<T extends Record<string, unknown>> = {
  provider: SchemaProvider<Record<string, unknown>>;
  parsedSchema: ParsedSchema;
  resolver?: Resolver<Record<string, unknown>, unknown, T>;
  isProto: boolean;
  protoDesc?: DescMessage;
};

export type AutoFormPayloadBuilderContext<T extends Record<string, unknown> = Record<string, unknown>> = {
  form: UseFormReturn<Record<string, unknown>, unknown, T>;
  schema: ParsedSchema;
  isProto: boolean;
  protoDesc?: DescMessage;
  mode: AutoFormMode;
  simpleFields: ParsedField[];
  advancedFields: ParsedField[];
};

export type AutoFormSummaryContext<T extends Record<string, unknown> = Record<string, unknown>> =
  AutoFormPayloadBuilderContext<T> & {
    payload: unknown;
    bestEffort: boolean;
  };

export type AutoFormProps<T extends Record<string, unknown> = Record<string, unknown>> = {
  schema: AutoFormSchemaInput<T>;
  /**
   * Called on field value change. Nested changes fire with the root-level key
   * (e.g. `onFieldChange('address', {...})`), not the dotted sub-path.
   */
  onFieldChange?: (
    fieldPath: string,
    value: unknown,
    form: UseFormReturn<Record<string, unknown>, unknown, T>
  ) => void | Promise<void>;
  testId?: string;
  onSubmit?: (values: T, form: UseFormReturn<Record<string, unknown>, unknown, T>) => void | Promise<void>;
  defaultValues?: Partial<T> | Partial<Record<string, unknown>>;
  values?: Partial<T> | Partial<Record<string, unknown>>;
  children?: React.ReactNode;
  uiComponents?: Partial<AutoFormUIComponents>;
  formComponents?: Partial<AutoFormFieldComponents>;
  withSubmit?: boolean;
  onFormInit?: (form: UseFormReturn<Record<string, unknown>, unknown, T>) => void;
  formProps?: React.ComponentProps<'form'> | Record<string, unknown>;
  fieldConfig?: FieldConfigMap;
  formOptions?: UseFormProps<Record<string, unknown>, unknown, T>;
  resolver?: Resolver<Record<string, unknown>, unknown, T>;
  modes?: AutoFormMode[];
  defaultMode?: AutoFormMode;
  showSummary?: boolean;
  renderSummary?: (payload: unknown, context: AutoFormSummaryContext<T>) => React.ReactNode;
  fieldRegistry?: FieldTypeRegistry;
  /**
   * Named data sources for controls annotated with `field_ui.data_provider`,
   * keyed by the proto `DataProviderId` enum. A CI test
   * (`__tests__/data-providers.test.ts`) asserts every referenced id is registered.
   */
  dataProviders?: import('./data-providers').DataProviderRegistry;
  classifyField?: (field: ParsedField) => 'simple' | 'advanced';
  payloadSchema?: {
    safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: unknown[]; message: string }> } };
  };
  stepper?: boolean;
  steps?: AutoFormStepConfig[];
  payloadBuilder?: (values: Record<string, unknown>, context: AutoFormPayloadBuilderContext<T>) => unknown;
  payloadParser?: (
    payload: unknown,
    context: AutoFormPayloadBuilderContext<T>
  ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
};
