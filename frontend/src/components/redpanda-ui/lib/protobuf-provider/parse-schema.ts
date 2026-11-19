// Copyright 2026 Redpanda Data, Inc.
import { type DescEnum, type DescField, type DescMessage, type DescOneof, ScalarType } from '@bufbuild/protobuf';
import { isWrapperDesc } from '@bufbuild/protobuf/wkt';
import { omitUndefined } from '../utils/omit-undefined';
import { getRegisteredProtoAnnotations } from './annotations';
import {
  ANY_TYPE,
  DURATION_TYPE,
  type EnumField,
  FIELD_MASK_TYPE,
  is64BitScalar,
  LIST_VALUE_TYPE,
  type ListField,
  type MapField,
  renameField,
  STRUCT_TYPE,
  TIMESTAMP_TYPE,
  tracksPresence,
  VALUE_TYPE,
} from './descriptor-utils';
import type { FieldRules } from './gen/buf/validate/validate_pb';
import {
  bigIntToNumber,
  buildFieldConfig,
  extractNumericBounds,
  formatEnumLabel,
  getFieldDescription,
  getFieldRules,
  getMessageDescription,
  getMessageRules,
  getOneofDescription,
  getOneofRules,
  getStringInputType,
  isUnspecifiedEnumValue,
  type ParsedProtoField,
  type ParsedProtoSchema,
  type ProtoJsonKind,
  type ProtoParserContext,
  withFieldUi,
  withOneofUi,
} from './metadata';
import type { ProtoMessageUiConfig } from './ui-options';
import { getProtoMessageUi } from './ui-options';

function buildStringField(field: DescField, rules: FieldRules, context: ProtoParserContext): ParsedProtoField {
  const stringRules = rules.type.case === 'string' ? rules.type.value : undefined;
  const inputType = getStringInputType(stringRules);

  const supportsUnset = tracksPresence(field);
  return {
    key: field.localName,
    type: 'string',
    required: rules.required,
    fieldConfig: buildFieldConfig(
      withFieldUi(
        omitUndefined({
          source: 'proto',
          desc: field,
          fieldRules: rules,
          inputType,
          supportsUnset,
        }),
        field
      ),
      {
        type: inputType,
        minLength: bigIntToNumber(stringRules?.minLen),
        maxLength: bigIntToNumber(stringRules?.maxLen),
        pattern: stringRules?.pattern === '' ? undefined : stringRules?.pattern,
      },
      getFieldDescription(field, context)
    ),
  };
}

function buildNumberField(
  field: DescField,
  rules: FieldRules,
  context: ProtoParserContext,
  scalar = field.scalar
): ParsedProtoField {
  const { min, max, step } = extractNumericBounds(rules);
  const isInt64 = is64BitScalar(scalar);

  const supportsUnset = tracksPresence(field);
  return {
    key: field.localName,
    type: isInt64 ? 'int64' : 'number',
    required: rules.required,
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          source: 'proto',
          desc: field,
          fieldRules: rules,
          supportsUnset,
        },
        field
      ),
      {
        min,
        max,
        step,
      },
      getFieldDescription(field, context)
    ),
  };
}

function buildBooleanField(field: DescField, rules: FieldRules, context: ProtoParserContext): ParsedProtoField {
  const supportsUnset = tracksPresence(field);
  return {
    key: field.localName,
    type: 'boolean',
    required: rules.required,
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          source: 'proto',
          desc: field,
          fieldRules: rules,
          supportsUnset,
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
  };
}

function buildBytesField(field: DescField, rules: FieldRules, context: ProtoParserContext): ParsedProtoField {
  const supportsUnset = tracksPresence(field);
  return {
    key: field.localName,
    type: 'bytes',
    required: rules.required,
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          source: 'proto',
          desc: field,
          fieldRules: rules,
          supportsUnset,
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
  };
}

function enumOptions(enumType: DescEnum): [string, string][] {
  const options: [string, string][] = [];
  for (const value of enumType.values) {
    if (!isUnspecifiedEnumValue(value)) {
      options.push([String(value.number), formatEnumLabel(value.localName, enumType.name)]);
    }
  }
  return options;
}

function buildEnumField(field: EnumField, rules: FieldRules, context: ProtoParserContext): ParsedProtoField {
  const supportsUnset = tracksPresence(field);
  return {
    key: field.localName,
    type: 'select',
    required: rules.required,
    options: enumOptions(field.enum),
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          source: 'proto',
          desc: field,
          fieldRules: rules,
          supportsUnset,
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
  };
}

function buildJsonField(
  field: DescField,
  rules: FieldRules,
  jsonKind: ProtoJsonKind,
  context: ProtoParserContext
): ParsedProtoField {
  const supportsUnset = tracksPresence(field);
  return {
    key: field.localName,
    type: 'json',
    required: rules.required,
    fieldConfig: buildFieldConfig(
      withFieldUi(
        {
          source: 'proto',
          desc: field,
          fieldRules: rules,
          jsonKind,
          supportsUnset,
        },
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
  };
}

function buildMessageField(
  field: DescField & { message: DescMessage },
  rules: FieldRules,
  context: ProtoParserContext
): ParsedProtoField {
  if (isWrapperDesc(field.message)) {
    const wrappedScalar = field.message.fields[0].scalar;
    if (wrappedScalar === ScalarType.BOOL) {
      return buildBooleanField(field, rules, context);
    }
    if (wrappedScalar === ScalarType.BYTES) {
      return buildBytesField(field, rules, context);
    }
    if (wrappedScalar === ScalarType.STRING) {
      return buildStringField(field, rules, context);
    }
    return buildNumberField(field, rules, context);
  }

  const description = getFieldDescription(field, context);

  switch (field.message.typeName) {
    case TIMESTAMP_TYPE: {
      const supportsUnset = tracksPresence(field);
      return {
        key: field.localName,
        type: 'timestamp',
        required: rules.required,
        fieldConfig: buildFieldConfig(
          withFieldUi(
            {
              source: 'proto',
              desc: field,
              fieldRules: rules,
              supportsUnset,
            },
            field
          ),
          {},
          description
        ),
      };
    }
    case DURATION_TYPE: {
      const supportsUnset = tracksPresence(field);
      return {
        key: field.localName,
        type: 'duration',
        required: rules.required,
        fieldConfig: buildFieldConfig(
          withFieldUi(
            {
              source: 'proto',
              desc: field,
              fieldRules: rules,
              supportsUnset,
            },
            field
          ),
          {},
          description
        ),
      };
    }
    case FIELD_MASK_TYPE: {
      const supportsUnset = tracksPresence(field);
      return {
        key: field.localName,
        type: 'fieldMask',
        required: rules.required,
        fieldConfig: buildFieldConfig(
          withFieldUi(
            omitUndefined({
              source: 'proto',
              desc: field,
              fieldRules: rules,
              supportsUnset,
              allowedPaths: rules.type.case === 'fieldMask' ? rules.type.value.in : undefined,
            }),
            field
          ),
          {},
          description
        ),
      };
    }
    case STRUCT_TYPE:
      return buildJsonField(field, rules, 'struct', context);
    case VALUE_TYPE:
      return buildJsonField(field, rules, 'value', context);
    case LIST_VALUE_TYPE:
      return buildJsonField(field, rules, 'listValue', context);
    case ANY_TYPE:
      return buildJsonField(field, rules, 'any', context);
    default: {
      const supportsUnset = tracksPresence(field);
      return {
        key: field.localName,
        type: 'object',
        required: rules.required,
        schema: parseProtoSchema(field.message, context.annotations, context.secretScope).fields,
        fieldConfig: buildFieldConfig(
          withFieldUi(
            {
              source: 'proto',
              desc: field,
              fieldRules: rules,
              messageRules: getMessageRules(field.message),
              supportsUnset,
            },
            field
          ),
          {},
          description ?? getMessageDescription(field.message, context)
        ),
      };
    }
  }
}

function buildListItemField(field: ListField, context: ProtoParserContext, itemRules?: FieldRules): ParsedProtoField {
  const syntheticField = renameField(field, 'value');

  if (field.listKind === 'scalar') {
    if (field.scalar === ScalarType.STRING) {
      return buildStringField(syntheticField, itemRules ?? getFieldRules(field), context);
    }
    if (field.scalar === ScalarType.BOOL) {
      return buildBooleanField(syntheticField, itemRules ?? getFieldRules(field), context);
    }
    if (field.scalar === ScalarType.BYTES) {
      return buildBytesField(syntheticField, itemRules ?? getFieldRules(field), context);
    }
    return buildNumberField(syntheticField, itemRules ?? getFieldRules(field), context);
  }

  if (field.listKind === 'enum') {
    return {
      key: 'value',
      type: 'select',
      required: false,
      options: enumOptions(field.enum),
      fieldConfig: buildFieldConfig(
        omitUndefined({
          source: 'proto',
          desc: field,
          fieldRules: itemRules,
        })
      ),
    };
  }

  return {
    key: 'value',
    type: 'object',
    required: false,
    schema: parseProtoSchema(field.message, context.annotations, context.secretScope).fields,
    fieldConfig: buildFieldConfig(
      omitUndefined({
        source: 'proto',
        desc: field,
        fieldRules: itemRules,
      }),
      {},
      getMessageDescription(field.message, context)
    ),
  };
}

function buildArrayField(field: ListField, rules: FieldRules, context: ProtoParserContext): ParsedProtoField {
  const repeatedRules = rules.type.case === 'repeated' ? rules.type.value : undefined;
  const minItems = bigIntToNumber(repeatedRules?.minItems);
  const maxItems = bigIntToNumber(repeatedRules?.maxItems);
  return {
    key: field.localName,
    type: 'array',
    required: Boolean(rules.required || repeatedRules?.minItems),
    schema: [buildListItemField(field, context, repeatedRules?.items)],
    fieldConfig: buildFieldConfig(
      withFieldUi(
        omitUndefined({
          source: 'proto',
          desc: field,
          fieldRules: rules,
          minItems,
          maxItems,
        }),
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
  };
}

function buildMapKeyField(
  field: MapField,
  rules: FieldRules | undefined,
  context: ProtoParserContext
): ParsedProtoField {
  const syntheticField = renameField(field, 'key');

  if (field.mapKey === ScalarType.BOOL) {
    return buildBooleanField(syntheticField, rules ?? getFieldRules(field), context);
  }
  if (field.mapKey === ScalarType.STRING) {
    return buildStringField(syntheticField, rules ?? getFieldRules(field), context);
  }
  return buildNumberField(syntheticField, rules ?? getFieldRules(field), context, field.mapKey);
}

function buildMapValueField(
  field: MapField,
  rules: FieldRules | undefined,
  context: ProtoParserContext
): ParsedProtoField {
  const syntheticField = renameField(field, 'value');

  if (field.mapKind === 'scalar') {
    if (field.scalar === ScalarType.STRING) {
      return buildStringField(syntheticField, rules ?? getFieldRules(field), context);
    }
    if (field.scalar === ScalarType.BOOL) {
      return buildBooleanField(syntheticField, rules ?? getFieldRules(field), context);
    }
    if (field.scalar === ScalarType.BYTES) {
      return buildBytesField(syntheticField, rules ?? getFieldRules(field), context);
    }
    return buildNumberField(syntheticField, rules ?? getFieldRules(field), context);
  }

  if (field.mapKind === 'enum') {
    return {
      key: 'value',
      type: 'select',
      required: false,
      options: enumOptions(field.enum),
      fieldConfig: buildFieldConfig(
        omitUndefined({
          source: 'proto',
          desc: field,
          fieldRules: rules,
        })
      ),
    };
  }

  return buildMessageField(renameField(field, 'value'), rules ?? getFieldRules(field), context);
}

function buildMapField(field: MapField, rules: FieldRules, context: ProtoParserContext): ParsedProtoField {
  const mapRules = rules.type.case === 'map' ? rules.type.value : undefined;
  const keyField = buildMapKeyField(field, mapRules?.keys, context);
  const valueField = buildMapValueField(field, mapRules?.values, context);

  const minPairs = bigIntToNumber(mapRules?.minPairs);
  const maxPairs = bigIntToNumber(mapRules?.maxPairs);
  return {
    key: field.localName,
    type: 'map',
    required: Boolean(rules.required || mapRules?.minPairs),
    schema: [keyField, valueField],
    fieldConfig: buildFieldConfig(
      withFieldUi(
        omitUndefined({
          source: 'proto',
          desc: field,
          fieldRules: rules,
          keyField,
          valueField,
          minPairs,
          maxPairs,
        }),
        field
      ),
      {},
      getFieldDescription(field, context)
    ),
  };
}

function buildOneofField(oneof: DescOneof, context: ProtoParserContext): ParsedProtoField {
  const oneofRules = getOneofRules(oneof);
  return {
    key: oneof.localName,
    type: 'oneof',
    required: oneofRules.required,
    schema: oneof.fields.map((field) => buildProtoField(field, context)),
    fieldConfig: buildFieldConfig(
      withOneofUi(
        {
          source: 'proto',
          oneof,
          oneofRules,
        },
        oneof
      ),
      {},
      getOneofDescription(oneof, context)
    ),
  };
}

function buildProtoField(field: DescField, context: ProtoParserContext): ParsedProtoField {
  const rules = getFieldRules(field);

  let result: ParsedProtoField;
  switch (field.fieldKind) {
    case 'scalar': {
      if (field.scalar === ScalarType.STRING) {
        result = buildStringField(field, rules, context);
        break;
      }
      if (field.scalar === ScalarType.BOOL) {
        result = buildBooleanField(field, rules, context);
        break;
      }
      if (field.scalar === ScalarType.BYTES) {
        result = buildBytesField(field, rules, context);
        break;
      }
      result = buildNumberField(field, rules, context);
      break;
    }
    case 'enum':
      result = buildEnumField(field, rules, context);
      break;
    case 'message':
      result = buildMessageField(field, rules, context);
      break;
    case 'list':
      result = buildArrayField(field, rules, context);
      break;
    case 'map':
      result = buildMapField(field, rules, context);
      break;
    default:
      throw new Error(`Unsupported protobuf field kind: ${(field as DescField).fieldKind}`);
  }

  if (context.secretScope !== undefined && context.secretScope !== '' && result.fieldConfig !== undefined) {
    result = {
      ...result,
      fieldConfig: {
        ...result.fieldConfig,
        customData: { ...result.fieldConfig.customData, secretScope: context.secretScope },
      },
    };
  }

  return result;
}

export function getProtoMessageUiConfig(desc: DescMessage): ProtoMessageUiConfig | undefined {
  return getProtoMessageUi(desc);
}

export function parseProtoSchema(
  desc: DescMessage,
  annotations = getRegisteredProtoAnnotations(desc),
  parentSecretScope?: string
): ParsedProtoSchema {
  const messageUi = getProtoMessageUi(desc);
  const context: ProtoParserContext = omitUndefined({
    annotations,
    messageUi,
    secretScope: messageUi?.secretScope ?? parentSecretScope,
  });
  return {
    fields: desc.members.map((member) =>
      member.kind === 'oneof' ? buildOneofField(member, context) : buildProtoField(member, context)
    ),
  };
}
