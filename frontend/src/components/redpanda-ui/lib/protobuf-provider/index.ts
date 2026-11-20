// Copyright 2026 Redpanda Data, Inc.
import type { DescMessage, MessageShape, MessageValidType } from '@bufbuild/protobuf';
import type { ValidatorOptions } from '@bufbuild/protovalidate';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Resolver } from 'react-hook-form';
import type { ParsedSchema, SchemaProvider, SchemaValidation } from '../form-types';
import { protoToFormValues } from './form-values';
import type { ParsedProtoSchema } from './metadata';
import { parseProtoSchema } from './parse-schema';
import { createProtoResolver, validateProtoValues } from './validation';
import { createProtoValidationSchema } from './validation-schema';

export { getRegisteredProtoAnnotations, type ProtoAnnotations, registerProtoAnnotations } from './annotations';
export { protoFormValuesToPayload, protoPayloadToFormValues, protoToFormValues } from './form-values';
export type { ProtoAnyFormValue, ProtoFieldRenderType, ProtoFieldType, ProtoMapFormEntry } from './metadata';
export { getProtoFieldCustomData, isProtoMessageDescriptor } from './metadata';
export { getProtoMessageUiConfig, parseProtoSchema } from './parse-schema';
export type { ProtoFieldUiConfig, ProtoMessageUiConfig, ProtoStepConfig, ProtoUiRule } from './ui-options';
export { createProtoResolver, PROTO_FORM_ROOT_ERROR_KEY } from './validation';

export class ProtoProvider<Desc extends DescMessage = DescMessage> implements SchemaProvider<MessageValidType<Desc>> {
  private readonly desc: Desc;
  private readonly parsedSchema: ParsedProtoSchema;
  private readonly standardSchema: StandardSchemaV1<MessageShape<Desc>, MessageValidType<Desc>>;
  private readonly resolver: Resolver<Record<string, unknown>, unknown, MessageValidType<Desc>>;

  constructor(desc: Desc, options?: ValidatorOptions) {
    this.desc = desc;
    this.parsedSchema = parseProtoSchema(desc);
    this.standardSchema = createProtoValidationSchema(desc, options);
    this.resolver = createProtoResolver(desc, options);
  }

  parseSchema(): ParsedSchema {
    return this.parsedSchema;
  }

  validateSchema(values: Record<string, unknown>): SchemaValidation<MessageValidType<Desc>> {
    const validationResult = validateProtoValues(this.desc, values, this.standardSchema);
    if (validationResult instanceof Promise) {
      return {
        success: false,
        errors: [
          {
            path: [],
            message:
              // Provider-based AutoForm consumers expect a synchronous result. Async protovalidate
              // flows should go through createProtoResolver(), which RHF can await.
              'ProtoProvider does not support async validation rules. Use createProtoResolver() for async protovalidate flows.',
          },
        ],
      };
    }
    return validationResult;
  }

  getDefaultValues(): Record<string, unknown> {
    return protoToFormValues(this.desc);
  }

  getResolver(): Resolver<Record<string, unknown>, unknown, MessageValidType<Desc>> {
    return this.resolver;
  }

  getMessageDescriptor(): Desc {
    return this.desc;
  }
}

interface ProtoSchemaProvider<T extends Record<string, unknown>> extends SchemaProvider<T> {
  getMessageDescriptor(): DescMessage;
  getResolver(): Resolver<Record<string, unknown>, unknown, T>;
}

export function isProtoProvider<T extends Record<string, unknown>>(
  value: SchemaProvider<T>
): value is ProtoSchemaProvider<T>;
export function isProtoProvider(value: unknown): value is ProtoProvider;
export function isProtoProvider(value: unknown): value is ProtoProvider {
  return value instanceof ProtoProvider;
}
