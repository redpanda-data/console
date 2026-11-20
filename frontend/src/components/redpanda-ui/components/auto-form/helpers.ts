import type { UseFormReturn } from 'react-hook-form';
import { getProtoFieldCustomData } from '../../lib/protobuf-provider';
import { omitUndefined } from '../../lib/utils/omit-undefined';
import type { ParsedField, SchemaValidation } from './core-types';
import { getPathInObject, sortFieldsByOrder } from './field-utils';
import { buildFieldMatchContext } from './registry';
import { getFieldUiConfig, isRecord } from './ui-config';

export const UNSET_SELECT_VALUE = '__autoform_unset__';
export const NUMERIC_OPTION_PATTERN = /^-?\d+$/;
export const FIELD_MASK_PATH_SPLIT_PATTERN = /[\n,]/;

export const SECRET_FIELD_PATTERN = /(password|secret|token|api[_-]?key|private[_-]?key|credential)/i;
export const CONSENT_FIELD_PATTERN = /(accept|agree|consent|terms|policy|opt[-_ ]?in)/i;
export const URL_FIELD_PATTERN = /(url|uri|website|homepage|link)/i;
export const EMAIL_FIELD_PATTERN = /(email|e-mail)/i;
export const CURRENCY_FIELD_PATTERN = /(amount|price|cost|balance|budget|revenue|salary|subtotal|total)/i;
export const LONG_TEXT_FIELD_PATTERN = /(bio|description|details|notes?|summary|message|comment)/i;

export function getRootErrorMessage(rootError: unknown): string | undefined {
  if (rootError === undefined || rootError === null || rootError === '') {
    return;
  }

  if (typeof rootError === 'string') {
    return rootError;
  }

  if (typeof rootError === 'object') {
    const errorRecord = rootError;
    const message: unknown = Reflect.get(errorRecord, 'message');
    if (typeof message === 'string' && message !== '') {
      return message;
    }

    const messages: string[] = [];
    for (const value of Object.values(errorRecord)) {
      const errorMessage = getRootErrorMessage(value);
      if (errorMessage !== undefined && errorMessage !== '') {
        messages.push(errorMessage);
      }
    }
    return messages.length === 0 ? undefined : messages.join('\n');
  }
  return undefined;
}

export function getFieldErrorMessage(
  errors: unknown,
  path: string[],
  fieldType?: ParsedField['type']
): string | undefined {
  if (typeof errors !== 'object' || errors === null) {
    return;
  }
  const nestedError = getPathInObject(errors, path);
  if (typeof nestedError !== 'object' || nestedError === null) {
    return;
  }
  const message: unknown = Reflect.get(nestedError, 'message');
  if (typeof message === 'string') {
    return message;
  }
  // RHF reserves `root` for collection validation; on other fields it can be a real child.
  return fieldType === 'array' || fieldType === 'map' ? getFieldErrorMessage(errors, [...path, 'root']) : undefined;
}

export function applyValidationErrors(
  form: UseFormReturn<Record<string, unknown>>,
  errors: Array<{ path: Array<string | number>; message: string }>
) {
  form.clearErrors();

  let hasFocused = false;
  const rootMessages: string[] = [];

  for (const error of errors) {
    if (error.path.length === 0) {
      rootMessages.push(error.message);
      continue;
    }

    const path = error.path.join('.');
    form.setError(
      path,
      {
        type: 'validation',
        message: error.message,
      },
      { shouldFocus: !hasFocused }
    );
    hasFocused = true;
  }

  if (rootMessages.length > 0) {
    form.setError('root', {
      type: 'validation',
      message: rootMessages.join('\n'),
    });
  }
}

function createEmptyJsonValue(kind: NonNullable<ReturnType<typeof getProtoFieldCustomData>>['jsonKind']): unknown {
  switch (kind) {
    case 'listValue':
      return [];
    case 'any':
      return { typeUrl: '', valueBase64: '' };
    case 'struct':
    case 'value':
    case undefined:
      return {};
    default:
      throw new Error('Unsupported protobuf JSON kind.');
  }
}

export function createEmptyFieldValue(field: ParsedField | undefined): unknown {
  if (field === undefined) {
    return;
  }

  const protoData = getProtoFieldCustomData(field);

  switch (field.type) {
    case 'string':
    case 'bytes':
    case 'duration':
    case 'int64':
    case 'timestamp':
      return '';
    case 'number':
      return;
    case 'boolean':
      return getFieldUiConfig(field).supportsUnset === true && !field.required ? undefined : false;
    case 'select': {
      const firstOption = field.required ? field.options?.[0] : undefined;
      if (firstOption === undefined) {
        return;
      }
      const optionValue = firstOption[0];
      const numericValue = Number(optionValue);
      return optionValue.trim() !== '' && !Number.isNaN(numericValue) ? numericValue : optionValue;
    }
    case 'fieldMask':
      return [];
    case 'json':
      return createEmptyJsonValue(protoData?.jsonKind);
    case 'array':
      return [];
    case 'map':
      return [];
    case 'oneof':
      return { case: undefined, value: undefined };
    case 'object':
      return {};
    case 'date':
      return '';
    default:
      return;
  }
}

function isKeyValueScalarField(field: ParsedField | undefined): boolean {
  if (field === undefined) {
    return false;
  }

  const renderType = resolveRenderFieldType(field);
  return ['string', 'email', 'url', 'password', 'currency', 'number', 'int64', 'select', 'combobox'].includes(
    renderType
  );
}

function isSimpleKeyValueLikeObject(field: ParsedField | undefined): boolean {
  if (!(field?.type === 'object' && field.schema?.length === 2)) {
    return false;
  }

  const keyField = field.schema.find((candidate) => candidate.key === 'key');
  const valueField = field.schema.find((candidate) => candidate.key === 'value');
  return (
    keyField !== undefined &&
    valueField !== undefined &&
    isKeyValueScalarField(keyField) &&
    isKeyValueScalarField(valueField)
  );
}

export function resolveRenderFieldType(field: ParsedField): string {
  const uiConfig = getFieldUiConfig(field);
  if (uiConfig.control !== undefined && uiConfig.control !== '') {
    return uiConfig.control;
  }

  switch (field.type) {
    case 'boolean':
      return resolveBooleanControl(field);
    case 'select':
      return resolveChoiceControl(field);
    case 'string':
      return resolveStringControl(field);
    case 'number':
      return resolveNumericControl(field);
    case 'array':
    case 'map':
      return resolveCollectionControl(field);
    default:
      return field.type;
  }
}

function resolveBooleanControl(field: ParsedField): string {
  if (getFieldUiConfig(field).supportsUnset === true && !field.required) {
    return 'boolean';
  }
  return CONSENT_FIELD_PATTERN.test(buildFieldMatchContext(field).identity) ? 'checkbox' : 'switch';
}

function resolveChoiceControl(field: ParsedField): string {
  const optionCount = field.options?.length ?? 0;
  if (optionCount > 8) {
    return 'combobox';
  }
  return optionCount > 0 && optionCount <= 3 ? 'radio' : 'select';
}

function resolveNumericControl(field: ParsedField): string {
  const min = Number(field.fieldConfig?.inputProps?.['min']);
  const max = Number(field.fieldConfig?.inputProps?.['max']);
  // This hint suppresses redundant range help; the actual slider widget remains annotation-driven.
  return Number.isFinite(min) && Number.isFinite(max) ? 'slider' : field.type;
}

function resolveCollectionControl(field: ParsedField): string {
  if (field.type === 'map') {
    return isKeyValueScalarField(field.schema?.[0]) && isKeyValueScalarField(field.schema?.[1])
      ? 'keyValue'
      : field.type;
  }
  const itemField = field.schema?.[0];
  if (itemField?.type === 'select' && (itemField.options?.length ?? 0) > 0) {
    return 'multiselect';
  }
  return isSimpleKeyValueLikeObject(itemField) ? 'keyValue' : field.type;
}

function resolveStringControl(field: ParsedField): string {
  const { identity, inputType, maxLength } = buildFieldMatchContext(field);
  if (SECRET_FIELD_PATTERN.test(identity) || inputType === 'password') {
    return 'password';
  }
  if (inputType === 'email' || EMAIL_FIELD_PATTERN.test(identity)) {
    return 'email';
  }
  if (inputType === 'url' || URL_FIELD_PATTERN.test(identity)) {
    return 'url';
  }
  if (CURRENCY_FIELD_PATTERN.test(identity)) {
    return 'currency';
  }
  if (inputType === 'textarea' || maxLength > 120 || LONG_TEXT_FIELD_PATTERN.test(identity)) {
    return 'textarea';
  }
  return field.type;
}

function buildRangeHint(field: ParsedField): string | undefined {
  const min = field.fieldConfig?.inputProps?.['min'];
  const max = field.fieldConfig?.inputProps?.['max'];

  // Number.isFinite guards against rendering "Accepted range: NaN to Infinity".
  if (typeof min === 'number' && Number.isFinite(min) && typeof max === 'number' && Number.isFinite(max)) {
    return `Accepted range: ${min} to ${max}.`;
  }
  if (typeof min === 'number' && Number.isFinite(min)) {
    return `Accepted minimum: ${min}.`;
  }
  if (typeof max === 'number' && Number.isFinite(max)) {
    return `Accepted maximum: ${max}.`;
  }
  return undefined;
}

function buildFallbackHelp(field: ParsedField): string {
  const renderType = resolveRenderFieldType(field);
  const hints = [
    typeof field.fieldConfig?.inputProps?.['pattern'] === 'string' && field.fieldConfig.inputProps['pattern'] !== ''
      ? 'Follow the expected format for this value.'
      : undefined,
    renderType === 'multiselect' ? 'Choose one or more options.' : undefined,
    renderType === 'radio' || renderType === 'select' || renderType === 'combobox'
      ? 'Choose one of the available options.'
      : undefined,
    renderType === 'slider' ? undefined : buildRangeHint(field),
    renderType === 'keyValue' ? 'Add one or more key-value pairs.' : undefined,
    renderType === 'json' ? 'Provide valid JSON for this field.' : undefined,
    field.type === 'duration' ? 'Use protobuf duration syntax like 300s.' : undefined,
    field.type === 'fieldMask' ? 'Enter one field path per line, or separate them with commas.' : undefined,
  ].filter((hint): hint is string => Boolean(hint));

  return hints[0] ?? '';
}

/**
 * Info-icon tooltip text. Only returned when it adds information beyond the
 * inline description (otherwise the info icon would be redundant).
 */
export function getFieldHelpText(field: ParsedField): string {
  const uiConfig = getFieldUiConfig(field);
  const descriptionText = getFieldDescriptionText(field);

  const parts = [
    uiConfig.help,
    uiConfig.example === undefined || uiConfig.example === '' ? undefined : `Example: ${uiConfig.example}`,
  ].filter((value): value is string => Boolean(value));

  const tooltip = [...new Set(parts)].join(' ');

  if (tooltip !== '' && tooltip === descriptionText) {
    return '';
  }

  return tooltip;
}

/**
 * Upstream docs URL annotated on the field, surfaced as a "Learn more" anchor
 * so catalogs/region lists point at the vendor's live list, not a stale snapshot.
 */
export function getFieldDocsUrl(field: ParsedField): string | undefined {
  const customData = field.fieldConfig?.customData;
  if (!(customData !== undefined && typeof customData === 'object')) {
    return;
  }
  if (typeof customData['docsUrl'] === 'string' && customData['docsUrl'] !== '') {
    return customData['docsUrl'];
  }
  const ui = customData['ui'];
  if (isRecord(ui) && typeof ui['docsUrl'] === 'string' && ui['docsUrl'] !== '') {
    return ui['docsUrl'];
  }
  return undefined;
}

/**
 * Inline description below the input. Resolution order: proto `description`,
 * then `fieldConfig.description`, then `help`, then `example`, then auto hints.
 */
export function getFieldDescriptionText(field: ParsedField): string | undefined {
  const uiConfig = getFieldUiConfig(field);

  if (uiConfig.description !== undefined && uiConfig.description !== '') {
    return uiConfig.description;
  }

  const configDescription =
    typeof field.fieldConfig?.description === 'string' ? field.fieldConfig.description : undefined;
  if (configDescription !== undefined && configDescription !== '') {
    return configDescription;
  }

  if (uiConfig.help !== undefined && uiConfig.help !== '') {
    return uiConfig.help;
  }

  if (uiConfig.example !== undefined && uiConfig.example !== '') {
    return `Example: ${uiConfig.example}`;
  }

  const fallback = buildFallbackHelp(field);
  return fallback.length > 0 ? fallback : undefined;
}

function hasSimpleRequiredCount(field: ParsedField): boolean {
  const protoData = getProtoFieldCustomData(field);
  return (protoData?.minItems ?? 0) > 0 || (protoData?.minPairs ?? 0) > 0;
}

/**
 * Required fields are "simple", optional are "advanced"; overridable via
 * `advanced` field-config metadata or the `classifyField` prop.
 */
export function defaultClassifyField(field: ParsedField): 'simple' | 'advanced' {
  const customData = isRecord(field.fieldConfig?.customData) ? field.fieldConfig.customData : undefined;
  if (customData?.['advanced'] === true) {
    return 'advanced';
  }
  if (customData?.['advanced'] === false) {
    return 'simple';
  }
  return field.required || hasSimpleRequiredCount(field) ? 'simple' : 'advanced';
}

export function deriveSimpleFields(
  fields: ParsedField[] | undefined,
  classifyField: (field: ParsedField) => 'simple' | 'advanced' = defaultClassifyField
): ParsedField[] {
  if (fields === undefined) {
    return [];
  }

  return sortFieldsByOrder(fields.flatMap((field) => deriveSimpleField(field, classifyField)));
}

function deriveSimpleField(
  field: ParsedField,
  classifyField: (field: ParsedField) => 'simple' | 'advanced'
): ParsedField[] {
  const simpleChildren = deriveSimpleFields(field.schema, classifyField);
  const hasRequiredDescendants = simpleChildren.length > 0;
  const isSimple = classifyField(field) === 'simple';
  const isContainer = field.type === 'object' || field.type === 'array' || field.type === 'map';
  if (isContainer) {
    if (!(isSimple || hasRequiredDescendants)) {
      return [];
    }
    // Map members are positional key/value slots, not independently removable fields.
    // Project message descendants while retaining both slots and their original order.
    let schema = hasRequiredDescendants ? simpleChildren : field.schema;
    if (field.type === 'map') {
      schema = field.schema?.map((member) => simpleChildren.find((child) => child.key === member.key) ?? member);
    }
    return [{ ...field, ...omitUndefined({ schema }) }];
  }
  if (field.type === 'oneof') {
    return isSimple || hasRequiredDescendants ? [field] : [];
  }
  return isSimple ? [field] : [];
}

export function collectLeafFieldPaths(fields: ParsedField[], path: string[] = []): string[] {
  return fields.flatMap((field) => {
    const nextPath = [...path, field.key];
    const renderType = resolveRenderFieldType(field);

    if (renderType === 'object' || renderType === 'array' || renderType === 'map' || renderType === 'oneof') {
      return field.schema !== undefined && field.schema.length > 0
        ? collectLeafFieldPaths(field.schema, nextPath)
        : [nextPath.join('.')];
    }

    return [nextPath.join('.')];
  });
}

export function filterFieldsByPaths(fields: ParsedField[], paths: string[], currentPath: string[] = []): ParsedField[] {
  if (paths.length === 0) {
    return [];
  }

  const directPaths = new Set(paths);
  const ancestors = new Set<string>();
  for (const path of paths) {
    let separator = path.indexOf('.');
    while (separator !== -1) {
      ancestors.add(path.slice(0, separator));
      separator = path.indexOf('.', separator + 1);
    }
  }
  return filterSelectedFields(fields, directPaths, ancestors, currentPath);
}

function filterSelectedFields(
  fields: ParsedField[],
  directPaths: ReadonlySet<string>,
  ancestors: ReadonlySet<string>,
  currentPath: string[]
): ParsedField[] {
  return sortFieldsByOrder(
    fields.flatMap((field) => {
      const nextPath = [...currentPath, field.key];
      const fullPath = nextPath.join('.');
      if (directPaths.has(fullPath)) {
        return [{ ...field }];
      }
      if (!ancestors.has(fullPath)) {
        return [];
      }
      return [{ ...field, schema: filterSelectedFields(field.schema ?? [], directPaths, ancestors, nextPath) }];
    })
  );
}

export function projectValuesToFields(values: Record<string, unknown>, fields: ParsedField[]): Record<string, unknown> {
  const projected: Record<string, unknown> = {};

  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined) {
      continue;
    }

    if (field.type === 'object' && isRecord(value) && field.schema !== undefined && field.schema.length > 0) {
      projected[field.key] = projectValuesToFields(value, field.schema);
      continue;
    }

    projected[field.key] = value;
  }

  return projected;
}

export function isMeaningfulValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.values(value).some((entry) => isMeaningfulValue(entry));
  }
  return true;
}

export function stringifySummaryValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (isRecord(value)) {
    return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}`;
  }
  return 'Unsupported value';
}

export function flattenSummaryEntries(
  payload: unknown,
  prefix = ''
): Array<{ key: string; value: unknown; isComplex: boolean }> {
  if (!isRecord(payload)) {
    return [];
  }

  return Object.entries(payload).flatMap(([key, value]) => {
    const nextKey = prefix === '' ? key : `${prefix}.${key}`;
    if (!isMeaningfulValue(value)) {
      return [];
    }

    if (isRecord(value)) {
      const nested = flattenSummaryEntries(value, nextKey);
      return nested.length > 0 ? nested : [{ key: nextKey, value, isComplex: true }];
    }

    if (Array.isArray(value) && value.some((entry) => isRecord(entry) || Array.isArray(entry))) {
      return [{ key: nextKey, value, isComplex: true }];
    }

    return [{ key: nextKey, value, isComplex: Array.isArray(value) }];
  });
}

export function isValidationSuccess(
  validation: SchemaValidation
): validation is Extract<SchemaValidation, { success: true }> {
  return validation.success;
}

function keyValueScalar(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  throw new TypeError('Expected a scalar key-value entry; structured data requires a JSON or nested field.');
}

export function normalizeKeyValueEntries(value: unknown): Array<{ key: string; value: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      return { key: '', value: '' };
    }

    return {
      key: keyValueScalar(entry['key']),
      value: keyValueScalar(entry['value']),
    };
  });
}

export function denormalizeKeyValueEntries(
  entries: Array<{ key: string; value: string }>,
  field: ParsedField
): Array<{ key: unknown; value: unknown }> {
  const valueField =
    field.type === 'map'
      ? field.schema?.[1]
      : field.schema?.[0]?.schema?.find((candidate) => candidate.key === 'value');

  return entries.map((entry) => ({
    key: entry.key,
    value: normalizeCollectionScalar(entry.value, valueField),
  }));
}

function normalizeCollectionScalar(value: string, field: ParsedField | undefined): unknown {
  if (field === undefined) {
    return value;
  }

  const renderType = resolveRenderFieldType(field);
  if (renderType === 'number') {
    return value === '' ? undefined : Number(value);
  }
  if (renderType === 'int64') {
    return value;
  }
  if (
    renderType === 'select' &&
    field.options?.every(([optionValue]) => NUMERIC_OPTION_PATTERN.test(optionValue)) === true
  ) {
    return value === '' ? undefined : Number(value);
  }
  return value;
}
