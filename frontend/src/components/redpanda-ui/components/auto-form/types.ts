import type { DescMessage, Message } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv2';
import type { ReactNode } from 'react';
import type { Resolver, UseFormProps, UseFormReturn } from 'react-hook-form';
import type { ProtoFieldRenderType, ProtoStepConfig, ProtoUiRule } from '../../lib/protobuf-provider';
import type {
  AutoFormFieldComponents,
  AutoFormUIComponents,
  FieldConfig,
  ParsedField,
  ParsedSchema,
  SchemaProvider,
} from './core-types';
import type { FieldTypeRegistry } from './registry';
import type { AutoFormSlotDescriptor } from './slots';

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

export type RenderFieldConfig = FieldConfig<FieldTypes>;
export type FieldConfigMap = Record<string, RenderFieldConfig>;
export type AutoFormSchemaInput<T extends Record<string, unknown>> = SchemaProvider<T> | GenMessage<T & Message>;

export type AutoFormUiRule = ProtoUiRule;

export type AutoFormStepConfig = ProtoStepConfig;

export interface ResolvedSchema<T extends Record<string, unknown>> {
  isProto: boolean;
  parsedSchema: ParsedSchema;
  protoDesc?: DescMessage | undefined;
  provider: SchemaProvider<T>;
  resolver?: Resolver<Record<string, unknown>, unknown, T> | undefined;
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
  children?: React.ReactNode | undefined;
  classifyField?: ((field: ParsedField) => 'simple' | 'advanced') | undefined;
  /**
   * Named data sources for controls annotated with `field_ui.data_provider`,
   * keyed by the proto `DataProviderId` enum. A CI test
   * (`__tests__/data-providers.test.ts`) asserts every referenced id is registered.
   */
  dataProviders?: import('./data-providers').DataProviderRegistry | undefined;
  defaultMode?: AutoFormMode | undefined;
  defaultValues?: Partial<T> | Partial<Record<string, unknown>> | undefined;
  fieldConfig?: FieldConfigMap | undefined;
  fieldRegistry?: FieldTypeRegistry | undefined;
  formComponents?: Partial<AutoFormFieldComponents> | undefined;
  formOptions?: UseFormProps<Record<string, unknown>, unknown, T> | undefined;
  formProps?: React.ComponentProps<'form'> | Record<string, unknown> | undefined;
  /** The live form methods; React clears this ref when the form unmounts. */
  formRef?: React.Ref<UseFormReturn<Record<string, unknown>, unknown, T>> | undefined;
  modes?: AutoFormMode[] | undefined;
  /**
   * Called on field value change. Nested changes fire with the root-level key
   * (e.g. `onFieldChange('address', {...})`), not the dotted sub-path.
   */
  onFieldChange?:
    | ((
        fieldPath: string,
        value: unknown,
        form: UseFormReturn<Record<string, unknown>, unknown, T>
      ) => void | Promise<void>)
    | undefined;
  onSubmit?:
    | ((values: T, form: UseFormReturn<Record<string, unknown>, unknown, T>) => void | Promise<void>)
    | undefined;
  payloadBuilder?:
    | ((values: Record<string, unknown>, context: AutoFormPayloadBuilderContext<T>) => unknown)
    | undefined;
  payloadParser?: (
    payload: unknown,
    context: AutoFormPayloadBuilderContext<T>
  ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
  payloadSchema?:
    | {
        safeParse: (data: unknown) => {
          success: boolean;
          error?: { issues: Array<{ path: unknown[]; message: string }> } | undefined;
        };
      }
    | undefined;
  renderSummary?: ((payload: unknown, context: AutoFormSummaryContext<T>) => React.ReactNode) | undefined;
  resolver?: Resolver<Record<string, unknown>, unknown, T> | undefined;
  schema: AutoFormSchemaInput<T>;
  showSummary?: boolean | undefined;
  /** Stable custom content placed at the current form/step start or next to a root field. */
  slots?: readonly AutoFormSlotDescriptor[] | undefined;
  stepper?: boolean | undefined;
  steps?: AutoFormStepConfig[] | undefined;
  testId?: string | undefined;
  uiComponents?: Partial<AutoFormUIComponents> | undefined;
  values?: Partial<T> | Partial<Record<string, unknown>> | undefined;
  withSubmit?: boolean | undefined;
}
