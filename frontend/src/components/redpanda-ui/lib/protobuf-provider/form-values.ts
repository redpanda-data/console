// Copyright 2026 Redpanda Data, Inc.
import {
  create,
  type DescField,
  type DescMessage,
  fromJson,
  fromJsonString,
  isMessage,
  type MessageShape,
  ScalarType,
  toJson,
  toJsonString,
} from '@bufbuild/protobuf';
import { base64Decode, base64Encode } from '@bufbuild/protobuf/wire';
import {
  DurationSchema,
  isWrapperDesc,
  ListValueSchema,
  StructSchema,
  TimestampSchema,
  timestampDate,
  timestampFromDate,
  ValueSchema,
} from '@bufbuild/protobuf/wkt';
import { z } from 'zod';
import {
  type ConversionContext,
  captureConversion,
  conversionAt,
  conversionFailed,
  createConversionContext,
} from './conversion-context';
import { checkedMapValue, createMessageFromInit, createValidationProjection } from './create-message';
import {
  ANY_TYPE,
  type AnyObject,
  DURATION_TYPE,
  FIELD_MASK_TYPE,
  is64BitScalar,
  isPlainObject,
  LIST_VALUE_TYPE,
  type ListField,
  type MapField,
  type MessageField,
  PROTO_JSON_FALLBACK_TYPES,
  STRUCT_TYPE,
  TIMESTAMP_TYPE,
  tracksPresence,
  VALUE_TYPE,
} from './descriptor-utils';
import type { ProtoAnyFormValue, ProtoMapFormEntry } from './metadata';
import { readOneofValue } from './oneof-value';
import { getProtoFieldUi } from './ui-options';

function toDateTimeLocalValue(timestamp: MessageShape<typeof TimestampSchema> | undefined): string | undefined {
  if (timestamp === undefined) {
    return;
  }

  const date = timestampDate(timestamp);
  if (Number.isNaN(date.getTime())) {
    return;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function objectHasValues(value: Record<string, unknown>): boolean {
  return Object.values(value).some((entry) => {
    if (entry === undefined || entry === null) {
      return false;
    }
    if (typeof entry === 'string') {
      return entry.trim().length > 0;
    }
    if (Array.isArray(entry)) {
      return entry.length > 0;
    }
    if (typeof entry === 'object') {
      return isPlainObject(entry) ? objectHasValues(entry) : true;
    }
    return true;
  });
}

function requireMessage<Desc extends DescMessage>(desc: Desc, value: unknown): MessageShape<Desc> {
  if (!isMessage(value, desc)) {
    throw new TypeError(`Expected a ${desc.typeName} protobuf message.`);
  }
  return value;
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError('Expected a protobuf message object.');
  }
  return value;
}

function fieldToFormValue(field: DescField, value: unknown): unknown {
  switch (field.fieldKind) {
    case 'scalar':
      return scalarToFormValue(field.scalar, value);
    case 'enum':
      return value;
    case 'message':
      return messageFieldToFormValue(field, value);
    case 'list':
      return Array.isArray(value) ? value.map((item) => listItemToFormValue(field, item)) : [];
    case 'map':
      return isPlainObject(value)
        ? Object.entries(value).map(
            ([key, entryValue]) => ({ key, value: mapValueToFormValue(field, entryValue) }) satisfies ProtoMapFormEntry
          )
        : [];
    default:
      return value;
  }
}

function scalarToFormValue(scalar: ScalarType | undefined, value: unknown): unknown {
  if (scalar === ScalarType.BYTES) {
    return value instanceof Uint8Array ? base64Encode(value) : undefined;
  }
  if (is64BitScalar(scalar)) {
    return typeof value === 'bigint' ? value.toString() : (value ?? undefined);
  }
  return value;
}

function fieldMaskToFormValue(value: unknown): string[] | undefined {
  if (!(isPlainObject(value) && Array.isArray(value['paths']))) {
    return;
  }
  return value['paths'].map((path: unknown) => {
    if (typeof path !== 'string') {
      throw new TypeError('Expected a string field-mask path.');
    }
    return path;
  });
}

function anyToFormValue(value: unknown): ProtoAnyFormValue | undefined {
  if (!isPlainObject(value)) {
    return;
  }
  return {
    typeUrl: typeof value['typeUrl'] === 'string' ? value['typeUrl'] : '',
    valueBase64: value['value'] instanceof Uint8Array ? base64Encode(value['value']) : '',
  };
}

function structToFormValue(field: MessageField, value: unknown): unknown {
  if (value === undefined) {
    return;
  }
  return field.parent.typeName === VALUE_TYPE
    ? toJson(StructSchema, requireMessage(StructSchema, value))
    : z.json().parse(requireObject(value));
}

function isMessageValuePresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function messageFieldToFormValue(field: MessageField, value: unknown): unknown {
  if (isWrapperDesc(field.message)) {
    return scalarToFormValue(field.message.fields[0].scalar, value);
  }
  switch (field.message.typeName) {
    case TIMESTAMP_TYPE:
      return toDateTimeLocalValue(value === undefined ? undefined : requireMessage(TimestampSchema, value));
    case DURATION_TYPE:
      return isMessageValuePresent(value)
        ? toJsonString(DurationSchema, requireMessage(DurationSchema, value)).replace(/"/g, '')
        : undefined;
    case FIELD_MASK_TYPE:
      return fieldMaskToFormValue(value);
    case STRUCT_TYPE:
      return structToFormValue(field, value);
    case VALUE_TYPE:
      return isMessageValuePresent(value) ? toJson(ValueSchema, requireMessage(ValueSchema, value)) : undefined;
    case LIST_VALUE_TYPE:
      return isMessageValuePresent(value) ? toJson(ListValueSchema, requireMessage(ListValueSchema, value)) : undefined;
    case ANY_TYPE:
      return anyToFormValue(value);
    default:
      return isMessageValuePresent(value) ? messageToFormValues(field.message, requireObject(value)) : undefined;
  }
}

function listItemToFormValue(field: ListField, value: unknown): unknown {
  if (field.listKind === 'message' && isMessageValuePresent(value)) {
    if (isWrapperDesc(field.message)) {
      return value;
    }
    return messageToFormValues(field.message, requireObject(value));
  }

  if (field.listKind === 'scalar' && field.scalar === ScalarType.BYTES) {
    return value instanceof Uint8Array ? base64Encode(value) : undefined;
  }

  if (field.listKind === 'scalar' && is64BitScalar(field.scalar)) {
    return typeof value === 'bigint' ? value.toString() : value;
  }

  return value;
}

function mapValueToFormValue(field: MapField, value: unknown): unknown {
  if (field.mapKind === 'message' && isMessageValuePresent(value)) {
    if (isWrapperDesc(field.message)) {
      return value;
    }
    return messageToFormValues(field.message, requireObject(value));
  }

  if (field.mapKind === 'scalar' && field.scalar === ScalarType.BYTES) {
    return value instanceof Uint8Array ? base64Encode(value) : undefined;
  }

  if (field.mapKind === 'scalar' && is64BitScalar(field.scalar)) {
    return typeof value === 'bigint' ? value.toString() : value;
  }

  return value;
}

function messageToFormValues(desc: DescMessage, value: AnyObject): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const member of desc.members) {
    if (member.kind === 'oneof') {
      const oneofValue = readOneofValue(value[member.localName]);
      if ((oneofValue.case ?? '') === '') {
        result[member.localName] = { case: undefined, value: undefined };
        continue;
      }

      const activeField = member.fields.find((field) => field.localName === oneofValue.case);
      result[member.localName] = {
        case: oneofValue.case,
        value: activeField === undefined ? oneofValue.value : fieldToFormValue(activeField, oneofValue.value),
      };
      continue;
    }

    result[member.localName] = fieldToFormValue(member, value[member.localName]);
  }

  return result;
}

export function protoToFormValues<Desc extends DescMessage>(
  desc: Desc,
  value?: MessageShape<Desc>
): Record<string, unknown> {
  const baseValue = requireObject(value ?? create(desc));
  return messageToFormValues(desc, baseValue);
}

function normalizeBooleanValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new TypeError('Expected a boolean or "true"/"false" for a protobuf boolean field.');
}

function normalizeNumberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return;
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new TypeError('Expected a number or numeric string for a protobuf number field.');
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed)) {
    throw new TypeError('Expected a valid number for a protobuf number field.');
  }
  return parsed;
}

function normalizeBigIntValue(value: unknown): bigint | undefined {
  if (value === undefined || value === null || value === '') {
    return;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch (error) {
      throw new TypeError('Expected an integer string for a protobuf 64-bit integer field.', { cause: error });
    }
  }
  throw new TypeError('Expected a bigint, safe integer or integer string for a protobuf 64-bit integer field.');
}

function primitiveText(value: unknown, message: string): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  throw new TypeError(message);
}

function normalizeScalarValue(field: Pick<DescField, 'scalar' | 'localName'>, value: unknown): unknown {
  if (field.scalar === ScalarType.STRING) {
    if (value === undefined || value === null) {
      return;
    }

    return primitiveText(value, `Expected text or a primitive scalar for protobuf field "${field.localName}".`);
  }
  if (field.scalar === ScalarType.BOOL) {
    return normalizeBooleanValue(value);
  }
  if (field.scalar === ScalarType.BYTES) {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      return base64Decode(value);
    }

    if (!(value instanceof Uint8Array)) {
      throw new TypeError(`Expected base64 text or bytes for protobuf field "${field.localName}".`);
    }
    return value;
  }
  if (is64BitScalar(field.scalar)) {
    return normalizeBigIntValue(value);
  }
  return normalizeNumberValue(value);
}

function normalizeTemporalValue(type: typeof TIMESTAMP_TYPE | typeof DURATION_TYPE, value: unknown): unknown {
  if (typeof value !== 'string' || value === '') {
    return;
  }
  return type === TIMESTAMP_TYPE
    ? timestampFromDate(new Date(value))
    : fromJsonString(DurationSchema, JSON.stringify(value));
}

function normalizeMessageFieldValue(field: MessageField, value: unknown, context?: ConversionContext): unknown {
  if (
    (field.message.typeName !== STRUCT_TYPE || field.parent.typeName === VALUE_TYPE) &&
    isMessage(value, field.message)
  ) {
    return value;
  }
  if (isWrapperDesc(field.message)) {
    const wrappedField = { scalar: field.message.fields[0].scalar, localName: field.localName };
    return normalizeScalarValue(wrappedField, value);
  }
  switch (field.message.typeName) {
    case TIMESTAMP_TYPE:
    case DURATION_TYPE:
      return normalizeTemporalValue(field.message.typeName, value);
    case FIELD_MASK_TYPE:
      return Array.isArray(value) && value.length > 0
        ? { paths: value.filter((entry): entry is string => typeof entry === 'string') }
        : undefined;
    case STRUCT_TYPE:
      return normalizeStructValue(field, value);
    case VALUE_TYPE:
      return value === undefined ? undefined : fromJson(ValueSchema, z.json().parse(value));
    case LIST_VALUE_TYPE:
      return value === undefined ? undefined : fromJson(ListValueSchema, z.json().parse(value));
    case ANY_TYPE:
      return normalizeAnyValue(value);
    default:
      return normalizeNestedMessage(field, value, context);
  }
}

function normalizeStructValue(field: MessageField, value: unknown): unknown {
  if (value === undefined) {
    return;
  }
  return field.parent.typeName === VALUE_TYPE
    ? fromJson(StructSchema, z.json().parse(value ?? {}))
    : z.json().parse(requireObject(value ?? {}));
}

function normalizeAnyValue(value: unknown): unknown {
  const anyValue = isPlainObject(value) ? (value as ProtoAnyFormValue) : undefined;
  if (
    !(
      (anyValue?.typeUrl !== undefined && anyValue.typeUrl !== '') ||
      (anyValue?.valueBase64 !== undefined && anyValue.valueBase64 !== '')
    )
  ) {
    return;
  }
  return { typeUrl: anyValue.typeUrl ?? '', value: base64Decode(anyValue.valueBase64 ?? '') };
}

function normalizeNestedMessage(field: MessageField, value: unknown, context?: ConversionContext): unknown {
  if (value !== undefined && value !== null && !isPlainObject(value)) {
    throw new TypeError(`Expected an object for protobuf message field "${field.localName}".`);
  }
  const nested = isPlainObject(value) ? messageToProtoInit(field.message, value, context) : undefined;
  if (!(nested !== undefined && objectHasValues(nested))) {
    return tracksPresence(field) && field.oneof === undefined ? undefined : nested;
  }
  return nested;
}

function listItemToProtoValue(field: ListField, value: unknown, context?: ConversionContext): unknown {
  if (field.listKind === 'scalar') {
    return normalizeScalarValue(field, value);
  }
  if (field.listKind === 'enum') {
    return value === undefined || value === '' ? undefined : Number(value);
  }
  if (isWrapperDesc(field.message)) {
    return value;
  }
  return isPlainObject(value) ? messageToProtoInit(field.message, value, context) : undefined;
}

function mapValueToProtoValue(field: MapField, value: unknown, context?: ConversionContext): unknown {
  if (field.mapKind === 'scalar') {
    return normalizeScalarValue(field, value);
  }
  if (field.mapKind === 'enum') {
    return value === undefined || value === '' ? undefined : Number(value);
  }
  if (isWrapperDesc(field.message)) {
    return value;
  }
  return isPlainObject(value) ? messageToProtoInit(field.message, value, context) : undefined;
}

/** Null/undefined or a whitespace-only string — i.e. an unfilled list row. */
function isEmptyStringEntry(entry: unknown): boolean {
  return entry === null || entry === undefined || (typeof entry === 'string' && entry.trim() === '');
}

/**
 * A repeated scalar-string field strips empty/whitespace-only entries on
 * submit so a blank "Add" row never ships as `""`. An empty entry is almost
 * always an unfinished row, and for some fields it is actively dangerous — an
 * empty regex compiles to a match-everything pattern. Fields where an empty
 * entry is meaningful opt out with the `allow_empty_items` field_ui annotation.
 */
function stripsEmptyStringEntries(field: DescField): boolean {
  return (
    field.fieldKind === 'list' &&
    field.listKind === 'scalar' &&
    field.scalar === ScalarType.STRING &&
    getProtoFieldUi(field)?.allowEmptyItems !== true
  );
}

function listToProtoValue(field: ListField, value: unknown, context?: ConversionContext): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected a list for protobuf field "${field.localName}".`);
  }
  const result: unknown[] = [];
  for (const [index, entry] of value.entries()) {
    if (stripsEmptyStringEntries(field) && isEmptyStringEntry(entry)) {
      continue;
    }
    const itemContext = conversionAt(context, [result.length], [index], field.listKind !== 'message');
    result.push(captureConversion(itemContext, () => listItemToProtoValue(field, entry, itemContext)));
  }
  return result;
}

function appendMapRow(
  field: MapField,
  result: Record<string, unknown>,
  entry: unknown,
  index: number,
  context?: ConversionContext
): void {
  if (!isPlainObject(entry)) {
    throw new TypeError(`Expected a map row object for protobuf field "${field.localName}".`);
  }
  const keyContext = conversionAt(context, ['$row', index, '$key'], [index, 'key'], true);
  const key = captureConversion(keyContext, () => {
    const rawKey = entry['key'];
    if (rawKey === undefined || rawKey === null || rawKey === '') {
      const value = entry['value'];
      if (isEmptyStringEntry(value) || (isPlainObject(value) && !objectHasValues(value))) {
        return;
      }
      if (rawKey !== '' || field.mapKey !== ScalarType.STRING) {
        throw new TypeError(`Expected a non-empty protobuf map key for "${field.localName}".`);
      }
    }
    const resultKey = primitiveText(rawKey, `Expected a primitive key for protobuf map "${field.localName}".`);
    if (Object.hasOwn(result, resultKey)) {
      throw new TypeError(`Duplicate protobuf map key "${resultKey}" for "${field.localName}".`);
    }
    return resultKey;
  });
  if (key === undefined) {
    if (conversionFailed(keyContext)) {
      const valueContext = conversionAt(context, ['$row', index, 'value'], [index, 'value']);
      const normalized = captureConversion(valueContext, () =>
        mapValueToProtoValue(field, entry['value'], valueContext)
      );
      captureConversion(valueContext, () => checkedMapValue(field, normalized, valueContext));
    }
    return;
  }
  conversionAt(context, [key, '$key'], [index, 'key'], true);
  const itemContext = conversionAt(context, [key], [index, 'value'], field.mapKind !== 'message');
  const normalized = captureConversion(itemContext, () => mapValueToProtoValue(field, entry['value'], itemContext));
  Object.defineProperty(result, key, { value: normalized, configurable: true, enumerable: true, writable: true });
}

function mapToProtoValue(field: MapField, value: unknown, context?: ConversionContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (value === undefined || value === null) {
    return result;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      conversionAt(context, [key, '$key'], [key], true);
      const itemContext = conversionAt(context, [key], [key], field.mapKind !== 'message');
      const normalized = captureConversion(itemContext, () => mapValueToProtoValue(field, item, itemContext));
      Object.defineProperty(result, key, { value: normalized, configurable: true, enumerable: true, writable: true });
    }
    return result;
  }
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected map rows or a map object for protobuf field "${field.localName}".`);
  }
  for (const [index, entry] of value.entries()) {
    const rowContext = conversionAt(context, ['$row', index], [index]);
    captureConversion(rowContext, () => {
      appendMapRow(field, result, entry, index, context);
    });
  }
  return result;
}

function fieldToProtoValue(field: DescField, value: unknown, context?: ConversionContext): unknown {
  switch (field.fieldKind) {
    case 'scalar':
      return normalizeScalarValue(field, value);
    case 'enum':
      return value === undefined || value === '' ? undefined : Number(value);
    case 'message':
      return normalizeMessageFieldValue(field, value, context);
    case 'list':
      return listToProtoValue(field, value, context);
    case 'map':
      return mapToProtoValue(field, value, context);
    default:
      return value;
  }
}

function oneofToProtoInit(
  member: DescMessage['oneofs'][number],
  value: unknown,
  context?: ConversionContext
): { case: string; value: unknown } | undefined {
  const selected = readOneofValue(value);
  if (selected.case === undefined || selected.case === '') {
    return;
  }
  const field = member.fields.find((candidate) => candidate.localName === selected.case);
  if (field === undefined) {
    throw new TypeError(`Unknown case "${selected.case}" for protobuf oneof "${member.localName}".`);
  }
  const valueContext = conversionAt(context, ['value'], ['value'], isOpaqueFormValue(field));
  return {
    case: selected.case,
    value: captureConversion(valueContext, () => fieldToProtoValue(field, selected.value, valueContext)),
  };
}

function messageToProtoInit(desc: DescMessage, value: AnyObject, context?: ConversionContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const member of desc.members) {
    if (member.kind === 'oneof') {
      const oneofContext = conversionAt(context, [member.localName], [member.localName], true);
      result[member.localName] = captureConversion(oneofContext, () =>
        oneofToProtoInit(member, value[member.localName], oneofContext)
      );
      continue;
    }

    const fieldContext = conversionAt(context, [member.localName], [member.localName], isOpaqueFormValue(member));
    const normalized = captureConversion(fieldContext, () =>
      fieldToProtoValue(member, value[member.localName], fieldContext)
    );
    if (normalized === undefined && tracksPresence(member)) {
      continue;
    }
    result[member.localName] = normalized;
  }

  return result;
}

function isOpaqueFormValue(field: DescField): boolean {
  return (
    field.fieldKind !== 'message' ||
    isWrapperDesc(field.message) ||
    PROTO_JSON_FALLBACK_TYPES.includes(field.message.typeName)
  );
}

export function formValuesToProtoInit(desc: DescMessage, values: Record<string, unknown>): Record<string, unknown> {
  return messageToProtoInit(desc, values);
}

export function formValuesToMessage<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>
): MessageShape<Desc> {
  return createMessageFromInit(desc, formValuesToProtoInit(desc, values));
}

/** Checked values used exclusively to diagnose a form; conversion failures forbid validated output. */
export function collectProtoFormDiagnostics<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>
): { projection: MessageShape<Desc>; context: ConversionContext } {
  const context = createConversionContext();
  const init = messageToProtoInit(desc, values, context);
  return { projection: createValidationProjection(desc, init, context), context };
}

export function protoFormValuesToPayload(desc: DescMessage, values: Record<string, unknown>): unknown {
  try {
    const message = formValuesToMessage(desc, values);
    // `alwaysEmitImplicit: true` forces every scalar / message field to
    // appear in the serialized JSON even when the form hasn't been
    // touched. Without it, an untouched form renders as `{}` in the
    // summary panel — so users have to start typing just to see the
    // request shape. Emitting defaults gives them the full schema
    // skeleton up front and reduces the interactions needed to
    // visualise what will actually be sent.
    return toJson(desc, message, { alwaysEmitImplicit: true });
  } catch {
    try {
      return formValuesToProtoInit(desc, values);
    } catch {
      return values;
    }
  }
}

export function protoPayloadToFormValues(desc: DescMessage, payload: unknown): Record<string, unknown> | undefined {
  try {
    const message = fromJson(desc, z.json().parse(payload ?? {}));
    return protoToFormValues(desc, message);
  } catch {
    return undefined;
  }
}
