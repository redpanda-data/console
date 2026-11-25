import { create, type DescField, type DescMessage, fromJson, type MessageShape, ScalarType } from '@bufbuild/protobuf';
import { type ReflectMessage, reflect, scalarZeroValue } from '@bufbuild/protobuf/reflect';
import { WireType } from '@bufbuild/protobuf/wire';
import { isWrapperDesc, StructSchema } from '@bufbuild/protobuf/wkt';
import { z } from 'zod';
import {
  aliasConversionPath,
  type ConversionContext,
  captureConversion,
  conversionAt,
  conversionFailed,
} from './conversion-context';
import { is64BitScalar, isPlainObject, STRUCT_TYPE, VALUE_TYPE } from './descriptor-utils';
import { readOneofValue } from './oneof-value';

const unknownFieldsSchema = z.array(
  z.object({
    no: z.number().int().positive().max(536_870_911),
    wireType: z.enum(WireType),
    data: z.instanceof(Uint8Array),
  })
);

function requireInit(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError('Expected an object when constructing a protobuf message.');
  }
  return value;
}

function nestedValue(field: DescField, value: unknown, context?: ConversionContext): ReflectMessage {
  const desc = field.message;
  if (desc === undefined) {
    throw new TypeError(`Field "${field.localName}" does not describe a message.`);
  }
  if (desc.typeName === STRUCT_TYPE && field.parent.typeName !== VALUE_TYPE) {
    return reflect(StructSchema, fromJson(StructSchema, z.json().parse(value)));
  }
  if (field.fieldKind === 'message' && field.oneof === undefined && isWrapperDesc(desc)) {
    const wrapper = reflect(desc);
    wrapper.set(desc.fields[0], value);
    return wrapper;
  }
  return reflect(desc, constructMessage(desc, requireInit(value), context));
}

function mapKey(scalar: ScalarType, key: string): string | number | bigint | boolean {
  if (scalar === ScalarType.STRING) {
    return key;
  }
  if (scalar === ScalarType.BOOL) {
    if (key !== 'true' && key !== 'false') {
      throw new TypeError(`Invalid protobuf boolean map key: "${key}".`);
    }
    return key === 'true';
  }
  if (key === '' || key.trim() !== key) {
    throw new TypeError(`Expected a non-empty integer protobuf map key without surrounding whitespace, got "${key}".`);
  }
  return is64BitScalar(scalar) ? BigInt(key) : Number(key);
}

function collectionDefault(field: DescField): unknown {
  if (field.scalar !== undefined) {
    return scalarZeroValue(field.scalar, false);
  }
  if (field.enum !== undefined) {
    const firstValue = field.enum.values[0];
    if (firstValue === undefined) {
      throw new TypeError(`Protobuf enum "${field.enum.typeName}" has no values.`);
    }
    return firstValue.number;
  }
  return reflect(field.message);
}

function setList(
  message: ReflectMessage,
  field: Extract<DescField, { fieldKind: 'list' }>,
  value: unknown,
  context?: ConversionContext
): void {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected a list for protobuf field "${field.localName}".`);
  }
  const list = message.get(field);
  for (const [index, item] of value.entries()) {
    const itemContext = conversionAt(context, [index]);
    captureConversion(itemContext, () => {
      list.add(field.listKind === 'message' ? nestedValue(field, item, itemContext) : item);
    });
    if (conversionFailed(itemContext)) {
      // Keep diagnostic indexes stable; affected constraints are not reported or returned as data.
      list.add(collectionDefault(field));
    }
  }
}

/** Check values independently so an invalid map key cannot hide a value conversion failure. */
export function checkedMapValue(
  field: Extract<DescField, { fieldKind: 'map' }>,
  value: unknown,
  context?: ConversionContext
): unknown {
  const result = field.mapKind === 'message' ? nestedValue(field, value, context) : value;
  reflect(field.parent).get(field).set(scalarZeroValue(field.mapKey, false), result);
  return result;
}

function setMap(
  message: ReflectMessage,
  field: Extract<DescField, { fieldKind: 'map' }>,
  value: unknown,
  context?: ConversionContext
): void {
  const map = message.get(field);
  const seenKeys = new Set<string>();
  const fieldEntries = Object.entries(requireInit(value));
  for (const [key, item] of fieldEntries) {
    const itemContext = conversionAt(context, [key]);
    const checkedValue = captureConversion(itemContext, () => checkedMapValue(field, item, itemContext));
    const keyContext = conversionAt(context, [key, '$key']);
    const checkedKey = captureConversion(keyContext, () => {
      const result = mapKey(field.mapKey, key);
      const outputKey = String(result);
      if (seenKeys.has(outputKey)) {
        throw new TypeError(`Duplicate protobuf map key "${key}" after integer normalization.`);
      }
      map.set(result, collectionDefault(field));
      seenKeys.add(outputKey);
      aliasConversionPath(context, key, outputKey);
      return result;
    });
    if (checkedKey === undefined) {
      continue;
    }
    captureConversion(itemContext, () => {
      map.set(checkedKey, checkedValue);
    });
  }
}

function setField(message: ReflectMessage, field: DescField, value: unknown, context?: ConversionContext): void {
  if (value === undefined || value === null) {
    return;
  }
  switch (field.fieldKind) {
    case 'scalar':
    case 'enum':
      message.set(field, value);
      return;
    case 'message':
      message.set(field, nestedValue(field, value, context));
      return;
    case 'list':
      setList(message, field, value, context);
      return;
    case 'map':
      setMap(message, field, value, context);
      return;
    default:
      throw new Error(field satisfies never);
  }
}

function setOneof(
  message: ReflectMessage,
  oneof: DescMessage['oneofs'][number],
  value: unknown,
  context?: ConversionContext
): void {
  const selected = readOneofValue(value);
  if (selected.case === undefined || selected.case === '') {
    return;
  }
  const caseName = selected.case;
  const field = oneof.fields.find((candidate) => candidate.localName === caseName);
  if (field === undefined) {
    throw new TypeError(`Unknown case "${caseName}" for protobuf oneof "${oneof.localName}".`);
  }
  const valueContext = conversionAt(context, ['value']);
  captureConversion(valueContext, () => {
    if (selected.value === undefined || selected.value === null) {
      throw new TypeError(`Expected a value for protobuf oneof "${oneof.localName}" case "${caseName}".`);
    }
    setField(message, field, selected.value, valueContext);
  });
}

/** Construct typed messages through Buf's checked reflection API, never an asserted initializer. */
function constructMessage<Desc extends DescMessage>(
  desc: Desc,
  init: Record<string, unknown>,
  context?: ConversionContext
): MessageShape<Desc> {
  const message = create(desc);
  const reflected = reflect(desc, message);
  if (init['$unknown'] !== undefined) {
    captureConversion(conversionAt(context, ['$unknown']), () => {
      reflected.setUnknown(unknownFieldsSchema.parse(init['$unknown']));
    });
  }
  for (const member of desc.members) {
    if (member.kind === 'field') {
      const fieldContext = conversionAt(context, [member.localName]);
      captureConversion(fieldContext, () => {
        setField(reflected, member, init[member.localName], fieldContext);
      });
      continue;
    }
    const oneofContext = conversionAt(context, [member.localName]);
    captureConversion(oneofContext, () => {
      setOneof(reflected, member, init[member.localName], oneofContext);
    });
  }
  return message;
}

/** Construct typed messages through Buf's checked reflection API; invalid input always throws. */
export function createMessageFromInit<Desc extends DescMessage>(
  desc: Desc,
  init: Record<string, unknown>
): MessageShape<Desc> {
  return constructMessage(desc, init);
}

/** Internal checked projection for diagnostics only; callers must retain every conversion failure. */
export function createValidationProjection<Desc extends DescMessage>(
  desc: Desc,
  init: Record<string, unknown>,
  context: ConversionContext
): MessageShape<Desc> {
  return constructMessage(desc, init, context);
}
