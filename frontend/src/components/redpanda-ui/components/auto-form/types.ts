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

export interface AutoFormOptionItem {
  icon?: ReactNode;
  label?: ReactNode;
  value: string;
}

export interface AutoFormOptionGroup {
  label?: ReactNode;
  options: AutoFormOptionItem[];
}

export type FieldTypes = ProtoFieldRenderType | 'date' | 'slider';

export type RenderFieldConfig = FieldConfig<FieldTypes, Record<string, unknown>>;
export type FieldConfigMap = Record<string, RenderFieldConfig>;
export type AutoFormSchemaInput<T extends Record<string, unknown>> = SchemaProvider<T> | DescMessage;

export type AutoFormUiRule = ProtoUiRule;

export type AutoFormStepConfig = ProtoStepConfig;

export interface ResolvedSchema<T extends Record<string, unknown>> {
  isProto: boolean;
  parsedSchema: ParsedSchema;
  protoDesc?: DescMessage;
  provider: SchemaProvider<Record<string, unknown>>;
  resolver?: Resolver<Record<string, unknown>, unknown, T>;
}

export interface AutoFormPayloadBuilderContext<T extends Record<string, unknown> = Record<string, unknown>> {
  advancedFields: ParsedField[];
  form: UseFormReturn<Record<string, unknown>, unknown, T>;
  isProto: boolean;
  mode: AutoFormMode;
  protoDesc?: DescMessage;
  schema: ParsedSchema;
  simpleFields: ParsedField[];
}

export type AutoFormSummaryContext<T extends Record<string, unknown> = Record<string, unknown>> =
  AutoFormPayloadBuilderContext<T> & {
    payload: unknown;
    bestEffort: boolean;
  };

export interface AutoFormProps<T extends Record<string, unknown> = Record<string, unknown>> {
  children?: React.ReactNode;
  classifyField?: (field: ParsedField) => 'simple' | 'advanced';
  /**
   * Named data sources for controls annotated with `field_ui.data_provider`,
   * keyed by the proto `DataProviderId` enum. A CI test
   * (`__tests__/data-providers.test.ts`) asserts every referenced id is registered.
   */
  dataProviders?: import('./data-providers').DataProviderRegistry;
  defaultMode?: AutoFormMode;
  defaultValues?: Partial<T> | Partial<Record<string, unknown>>;
  fieldConfig?: FieldConfigMap;
  fieldRegistry?: FieldTypeRegistry;
  formComponents?: Partial<AutoFormFieldComponents>;
  formOptions?: UseFormProps<Record<string, unknown>, unknown, T>;
  formProps?: React.ComponentProps<'form'> | Record<string, unknown>;
  modes?: AutoFormMode[];
  /**
   * Called on field value change. Nested changes fire with the root-level key
   * (e.g. `onFieldChange('address', {...})`), not the dotted sub-path.
   */
  onFieldChange?: (
    fieldPath: string,
    value: unknown,
    form: UseFormReturn<Record<string, unknown>, unknown, T>
  ) => void | Promise<void>;
  onFormInit?: (form: UseFormReturn<Record<string, unknown>, unknown, T>) => void;
  onSubmit?: (values: T, form: UseFormReturn<Record<string, unknown>, unknown, T>) => void | Promise<void>;
  payloadBuilder?: (values: Record<string, unknown>, context: AutoFormPayloadBuilderContext<T>) => unknown;
  payloadParser?: (
    payload: unknown,
    context: AutoFormPayloadBuilderContext<T>
  ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
  payloadSchema?: {
    safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: unknown[]; message: string }> } };
  };
  renderSummary?: (payload: unknown, context: AutoFormSummaryContext<T>) => React.ReactNode;
  resolver?: Resolver<Record<string, unknown>, unknown, T>;
  schema: AutoFormSchemaInput<T>;
  showSummary?: boolean;
  stepper?: boolean;
  steps?: AutoFormStepConfig[];
  testId?: string;
  uiComponents?: Partial<AutoFormUIComponents>;
  values?: Partial<T> | Partial<Record<string, unknown>>;
  withSubmit?: boolean;
}
