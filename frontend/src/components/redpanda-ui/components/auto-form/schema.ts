import type { Resolver } from 'react-hook-form';
import { createProtoResolver, isProtoMessageDescriptor, isProtoProvider, ProtoProvider } from '../../lib/protobuf-provider';
import { omitUndefined } from '../../lib/utils/omit-undefined';
import type { ParsedField, SchemaProvider } from './core-types';
import { sortFieldsByOrder } from './field-utils';
import type { AutoFormSchemaInput, FieldConfigMap, ResolvedSchema } from './types';

function isSchemaProvider<T extends Record<string, unknown>>(
  value: AutoFormSchemaInput<T>
): value is SchemaProvider<T> {
  return (
    typeof value === 'object' &&
    'parseSchema' in value &&
    typeof value.parseSchema === 'function' &&
    'validateSchema' in value &&
    typeof value.validateSchema === 'function' &&
    'getDefaultValues' in value &&
    typeof value.getDefaultValues === 'function'
  );
}

export function resolveSchema<T extends Record<string, unknown>>(
  schemaInput: AutoFormSchemaInput<T>,
  resolverOverride?: Resolver<Record<string, unknown>, unknown, T>
): ResolvedSchema<T> {
  if (isSchemaProvider(schemaInput)) {
    const provider = schemaInput;
    const parsedSchema = provider.parseSchema();

    if (isProtoProvider(provider)) {
      const protoDesc = provider.getMessageDescriptor();
      return {
        provider,
        parsedSchema,
        resolver: resolverOverride ?? provider.getResolver(),
        isProto: true,
        protoDesc,
      };
    }

    return {
      provider,
      parsedSchema,
      ...omitUndefined({ resolver: resolverOverride }),
      isProto: false,
    };
  }

  if (isProtoMessageDescriptor(schemaInput)) {
    const provider = new ProtoProvider(schemaInput);
    return {
      provider,
      parsedSchema: provider.parseSchema(),
      resolver: resolverOverride ?? createProtoResolver(schemaInput),
      isProto: true,
      protoDesc: schemaInput,
    };
  }

  throw new Error('Unsupported AutoForm schema input. Pass a SchemaProvider or a Buf message descriptor.');
}

export function mergeFieldOverrides(
  fields: ParsedField[] | undefined,
  overrides: FieldConfigMap | undefined,
  path: string[] = []
): ParsedField[] {
  if (fields === undefined) {
    return [];
  }

  return sortFieldsByOrder(
    fields.map((field) => {
      const fieldPath = [...path, field.key].join('.');
      const override = overrides?.[fieldPath];
      const existingConfig = field.fieldConfig ?? {};
      const mergedFieldConfig: ParsedField['fieldConfig'] =
        override === undefined
          ? field.fieldConfig
          : {
              ...existingConfig,
              ...override,
              inputProps: {
                ...existingConfig.inputProps,
                ...override.inputProps,
              },
              customData: {
                ...existingConfig.customData,
                ...override.customData,
              },
            };

      const nextSchema =
        (field.schema?.length ?? 0) > 0
          ? mergeFieldOverrides(field.schema, overrides, [...path, field.key])
          : field.schema;

      return {
        ...field,
        ...omitUndefined({ fieldConfig: mergedFieldConfig, schema: nextSchema }),
      };
    })
  );
}
