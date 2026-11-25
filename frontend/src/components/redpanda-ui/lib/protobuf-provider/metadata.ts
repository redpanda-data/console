// Copyright 2026 Redpanda Data, Inc.
import { create, type DescField, type DescMessage, type DescOneof, getExtension } from '@bufbuild/protobuf';
import { FieldOptionsSchema, MessageOptionsSchema, OneofOptionsSchema } from '@bufbuild/protobuf/wkt';
import { z } from 'zod';
import type { ParsedField, ParsedSchema } from '../form-types';
import { omitUndefined } from '../utils/omit-undefined';
import type { ProtoAnnotations } from './annotations';
import type { FieldRules, MessageRules, OneofRules, StringRules } from './gen/buf/validate/validate_pb';
import {
  field as fieldExtension,
  message as messageExtension,
  oneof as oneofExtension,
} from './gen/buf/validate/validate_pb';
import type { ProtoFieldUiConfig, ProtoMessageUiConfig } from './ui-options';
import { getProtoFieldUi, getProtoOneofUi } from './ui-options';

export type ProtoFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'object'
  | 'array'
  | 'oneof'
  | 'map'
  | 'bytes'
  | 'int64'
  | 'timestamp'
  | 'duration'
  | 'fieldMask'
  | 'json';

export type ProtoFieldRenderType =
  | ProtoFieldType
  | 'textarea'
  | 'password'
  | 'email'
  | 'url'
  | 'currency'
  | 'checkbox'
  | 'switch'
  | 'toggle'
  | 'radio'
  | 'combobox'
  | 'multiselect'
  | 'toggleGroup'
  | 'keyValue'
  | 'secretSelector'
  // Widget routing derived from field_ui annotations — `data_provider`
  // promotes a string/number field to `dataProviderSelect`, and a JSON
  // field with `dropzone: true` promotes to `dropzone-json`.
  | 'dataProviderSelect'
  | 'dropzone-json';

export type ProtoJsonKind = 'struct' | 'value' | 'listValue' | 'any';

export type ParsedProtoField = ParsedField;
export type ParsedProtoSchema = ParsedSchema;

interface ProtoFieldCustomData {
  allowedPaths?: string[];
  desc?: DescField;
  fieldRules?: FieldRules;
  inputType?: string;
  jsonKind?: ProtoJsonKind;
  keyField?: ParsedProtoField;
  maxItems?: number;
  maxPairs?: number;
  messageRules?: MessageRules;
  minItems?: number;
  minPairs?: number;
  oneof?: DescOneof;
  oneofRules?: OneofRules;
  secretScope?: string;
  source: 'proto';
  supportsUnset?: boolean;
  ui?: ProtoFieldUiConfig;
  valueField?: ParsedProtoField;
  [key: string]: unknown;
}

type ProtoFieldConfig = Omit<NonNullable<ParsedProtoField['fieldConfig']>, 'customData'> & {
  customData?: ProtoFieldCustomData;
};

// Descriptors and validation rules remain builder-owned. Consumer overrides may
// replace only the independently validated rendering hints below.
const protoHintsSchema = z.object({
  allowedPaths: z.array(z.string()).optional(),
  inputType: z.string().optional(),
  jsonKind: z.enum(['struct', 'value', 'listValue', 'any']).optional(),
  maxItems: z.int().nonnegative().optional(),
  maxPairs: z.int().nonnegative().optional(),
  minItems: z.int().nonnegative().optional(),
  minPairs: z.int().nonnegative().optional(),
  secretScope: z.string().optional(),
  supportsUnset: z.boolean().optional(),
});

const PROTO_METADATA = Symbol('protobuf-field-metadata');

class ProtoFieldMetadata {
  readonly data: ProtoFieldCustomData;

  constructor(data: ProtoFieldCustomData) {
    this.data = data;
  }
}

export interface ProtoAnyFormValue {
  typeUrl?: string;
  valueBase64?: string;
}

export interface ProtoMapFormEntry {
  key: unknown;
  value: unknown;
}

export interface ProtoParserContext {
  annotations?: ProtoAnnotations;
  messageUi?: ProtoMessageUiConfig;
  secretScope?: string;
}

export function isProtoMessageDescriptor(value: unknown): value is DescMessage {
  return (
    value !== null &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'message' &&
    'typeName' in value &&
    typeof value.typeName === 'string' &&
    'members' in value &&
    Array.isArray(value.members)
  );
}

export function getProtoFieldCustomData(field: ParsedField): ProtoFieldCustomData | undefined {
  const data = field.fieldConfig?.customData;
  if (data === undefined || !(PROTO_METADATA in data)) {
    return;
  }
  const metadata = data[PROTO_METADATA];
  if (!(metadata instanceof ProtoFieldMetadata)) {
    return;
  }
  if (Object.is(data, metadata.data)) {
    return metadata.data;
  }
  return omitUndefined({ ...metadata.data, ...protoHintsSchema.parse(data) });
}

export function getFieldRules(field: DescField): FieldRules {
  return getExtension(field.proto.options ?? create(FieldOptionsSchema), fieldExtension);
}

export function getMessageRules(desc: DescMessage): MessageRules {
  return getExtension(desc.proto.options ?? create(MessageOptionsSchema), messageExtension);
}

export function getOneofRules(oneof: DescOneof): OneofRules {
  return getExtension(oneof.proto.options ?? create(OneofOptionsSchema), oneofExtension);
}

const UNSPECIFIED_PATTERN = /(unspecified|unknown)$/i;

export function isUnspecifiedEnumValue(enumValue: { number: number; localName: string; name?: string }): boolean {
  if (enumValue.number !== 0) {
    return false;
  }
  // Check both localName (camelCase) and name (SCREAMING_SNAKE_CASE) for unspecified/unknown suffix
  return (
    UNSPECIFIED_PATTERN.test(enumValue.localName) ||
    (typeof enumValue.name === 'string' && UNSPECIFIED_PATTERN.test(enumValue.name))
  );
}

const ENUM_LABEL_SEPARATOR_PATTERN = /[\s_.-]+/;
const ENUM_LABEL_ACRONYM_BOUNDARY = /([A-Z])([A-Z][a-z])/g;
const ENUM_LABEL_CASE_BOUNDARY = /([a-z0-9])([A-Z])/g;
const ENUM_LABEL_NUMERIC_SUFFIX = /\d+$/;

function enumLabelWords(input: string): string[] {
  return input
    .replace(ENUM_LABEL_ACRONYM_BOUNDARY, '$1 $2')
    .replace(ENUM_LABEL_CASE_BOUNDARY, '$1 $2')
    .split(ENUM_LABEL_SEPARATOR_PATTERN)
    .filter((word) => word.length > 0);
}

const ENUM_LABEL_ACRONYMS = new Set(['API', 'URL', 'ID', 'TLS', 'GRPC', 'MCP', 'SQL', 'UUID', 'SSE', 'HTTP', 'JSON']);

// Strip only complete prefix words; protoc-gen-es may have stripped them already.
// Consumers can still override these defaults via optionLabels in fieldConfig.
export function formatEnumLabel(enumLocalName: string, enumTypeName: string): string {
  const words = enumLabelWords(enumLocalName);
  const typeWords = enumLabelWords(enumTypeName);
  const typePrefix = typeWords.join('').toLowerCase();
  const typeBoundaries = new Set<number>();
  let boundary = 0;
  for (const word of typeWords) {
    boundary += word.length;
    typeBoundaries.add(boundary);
  }
  let valuePrefix = '';
  let prefixWordCount = 0;
  for (const word of words) {
    valuePrefix += word.toLowerCase();
    prefixWordCount++;
    if (!typeBoundaries.has(valuePrefix.length)) {
      valuePrefix = '';
      break;
    }
    if (valuePrefix.length >= typePrefix.length) {
      break;
    }
  }
  const labelWords =
    typePrefix !== '' && valuePrefix === typePrefix && prefixWordCount < words.length
      ? words.slice(prefixWordCount)
      : words;
  return labelWords
    .map((word) => {
      const upper = word.toUpperCase();
      return ENUM_LABEL_ACRONYMS.has(upper.replace(ENUM_LABEL_NUMERIC_SUFFIX, ''))
        ? upper
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function bigIntToNumber(value: bigint | undefined): number | undefined {
  if (value === undefined) {
    return;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

export function getStringInputType(rules: StringRules | undefined): string | undefined {
  const format = rules?.wellKnown.case;
  if (format === 'email') {
    return 'email';
  }
  if (format === 'uri') {
    return 'url';
  }
  return format === 'uuid' ? 'text' : undefined;
}

export function withFieldUi(customData: ProtoFieldCustomData, field: DescField): ProtoFieldCustomData {
  return omitUndefined({
    ...customData,
    ui: getProtoFieldUi(field),
  });
}

export function withOneofUi(customData: ProtoFieldCustomData, oneof: DescOneof): ProtoFieldCustomData {
  return omitUndefined({
    ...customData,
    ui: getProtoOneofUi(oneof),
  });
}

export function buildFieldConfig(
  customData: ProtoFieldCustomData,
  inputProps: Record<string, unknown> = {},
  description?: string
): ProtoFieldConfig {
  const fieldType = customData.ui?.control;
  const placeholder = customData.ui?.placeholder;

  return omitUndefined({
    description,
    fieldType,
    inputProps: {
      ...(placeholder === undefined || placeholder === '' ? {} : { placeholder }),
      ...inputProps,
    },
    customData: Object.assign(customData, { [PROTO_METADATA]: new ProtoFieldMetadata(customData) }),
  });
}

export function getMessageDescription(desc: DescMessage, context: ProtoParserContext): string | undefined {
  return context.annotations?.messages?.[desc.typeName];
}

export function getFieldDescription(field: DescField, context: ProtoParserContext): string | undefined {
  return context.annotations?.fields?.[`${field.parent.typeName}.${field.localName}`];
}

export function getOneofDescription(oneof: DescOneof, context: ProtoParserContext): string | undefined {
  return context.annotations?.oneofs?.[`${oneof.parent.typeName}.${oneof.localName}`];
}

export function extractNumericBounds(rules: FieldRules | undefined): { min?: number; max?: number; step?: string } {
  const typeCase = rules?.type.case;
  if (rules === undefined || typeCase === undefined) {
    return {};
  }
  const numericRules = rules.type.value;
  if (!('lessThan' in numericRules && 'greaterThan' in numericRules)) {
    return {};
  }
  const step = ['float', 'double'].includes(typeCase) ? 'any' : '1';
  return omitUndefined({
    min: readNumericBound(numericRules.greaterThan, step),
    max: readNumericBound(numericRules.lessThan, step),
    step,
  });
}

function readNumericBound(bound: { case: string | undefined; value?: unknown }, step: '1' | 'any'): number | undefined {
  if (typeof bound.value !== 'number' && typeof bound.value !== 'bigint') {
    return;
  }
  if (bound.case === 'gte' || bound.case === 'lte') {
    return Number(bound.value);
  }
  if (bound.case !== 'gt' && bound.case !== 'lt') {
    return;
  }
  const value = Number(bound.value);
  const direction = bound.case === 'gt' ? 1 : -1;
  return Number.isFinite(value) ? value + (step === '1' ? direction : 0) : undefined;
}
