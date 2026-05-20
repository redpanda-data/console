import type { UseFormReturn } from 'react-hook-form';

import type { ParsedField, SchemaValidation } from './core-types';
import { getLabel, getPathInObject, sortFieldsByOrder } from './field-utils';
import { getProtoFieldCustomData } from './proto';
import type { AutoFormOptionGroup, AutoFormOptionItem, AutoFormUiRule, FieldTypes } from './types';

export const UNSET_SELECT_VALUE = '__autoform_unset__';
export const NUMERIC_OPTION_PATTERN = /^-?\d+$/;
export const FIELD_MASK_PATH_SPLIT_PATTERN = /[\n,]/;

export const SECRET_FIELD_PATTERN = /(password|secret|token|api[_-]?key|private[_-]?key|credential)/i;
export const CONSENT_FIELD_PATTERN = /(accept|agree|consent|terms|policy|opt[-_ ]?in)/i;
export const URL_FIELD_PATTERN = /(url|uri|website|homepage|link)/i;
export const EMAIL_FIELD_PATTERN = /(email|e-mail)/i;
export const CURRENCY_FIELD_PATTERN = /(amount|price|cost|balance|budget|revenue|salary|subtotal|total)/i;
export const LONG_TEXT_FIELD_PATTERN = /(bio|description|details|notes?|summary|message|comment)/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toUiRules(value: unknown): AutoFormUiRule[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }

  const rules: AutoFormUiRule[] = [];

  for (const rule of value) {
    if (!isRecord(rule) || typeof rule.expression !== 'string') {
      continue;
    }

    rules.push({
      id: typeof rule.id === 'string' ? rule.id : undefined,
      expression: rule.expression,
      message: typeof rule.message === 'string' ? rule.message : undefined,
    });
  }

  return rules.length > 0 ? rules : undefined;
}

function toOptionItem(value: unknown): AutoFormOptionItem | undefined {
  if (!isRecord(value) || typeof value.value !== 'string') {
    return;
  }

  return {
    value: value.value,
    label: typeof value.label === 'string' || typeof value.label === 'number' ? String(value.label) : undefined,
    icon: value.icon as AutoFormOptionItem['icon'],
  };
}

function toOptionGroups(value: unknown): AutoFormOptionGroup[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }

  const groups: AutoFormOptionGroup[] = [];

  for (const candidate of value) {
    if (!(isRecord(candidate) && Array.isArray(candidate.options))) {
      continue;
    }

    const options = candidate.options
      .map(toOptionItem)
      .filter((option): option is AutoFormOptionItem => Boolean(option));
    if (options.length === 0) {
      continue;
    }

    groups.push({
      label:
        typeof candidate.label === 'string' || typeof candidate.label === 'number'
          ? String(candidate.label)
          : undefined,
      options,
    });
  }

  return groups.length > 0 ? groups : undefined;
}

/**
 * Derive the field-type name from the annotation set so the AutoForm
 * resolver picks the right widget even when a proto `control` is also
 * set. Order:
 *   1. `dataProvider` wins — the field is an opinionated dropdown.
 *   2. `dropzone` + `control === 'json'` wins — the field is a JSON
 *      editor with drag-and-drop.
 *   3. Otherwise, `undefined` so the existing control/type path resolves.
 *
 * Reads from all three UI sources (proto, nested customData.ui, direct
 * customData) so either side can trigger the override.
 */
interface AnnotatedUi {
  control?: unknown;
  dataProvider?: unknown;
  dropzone?: unknown;
}

/**
 * `deriveAnnotatedControl` must NOT run for complex field types
 * (array / map / object). If it did, a `repeated string` field
 * annotated with `data_provider` — e.g. `OpenAPI.filter.include_methods`
 * — would short-circuit to `dataProviderSelect` on the array field
 * itself, bypassing `ArrayFieldRenderer`'s Add-button UI entirely.
 * The annotation still flows through to the array's schema[0] item
 * template (same proto descriptor), so each added item picks up
 * `dataProviderSelect` on its own.
 */
function isComplexFieldType(type: unknown): boolean {
  return type === 'array' || type === 'map' || type === 'object';
}

function deriveAnnotatedControl(
  fieldType: unknown,
  protoUi: AnnotatedUi | undefined,
  nested: AnnotatedUi | undefined,
  direct: AnnotatedUi | undefined
): FieldTypes | undefined {
  if (isComplexFieldType(fieldType)) {
    return;
  }

  const dataProvider =
    (typeof direct?.dataProvider === 'string' && direct.dataProvider) ||
    (typeof nested?.dataProvider === 'string' && nested.dataProvider) ||
    (typeof protoUi?.dataProvider === 'string' && protoUi.dataProvider) ||
    undefined;
  if (dataProvider) {
    return 'dataProviderSelect' as FieldTypes;
  }

  const dropzone = direct?.dropzone === true || nested?.dropzone === true || protoUi?.dropzone === true;
  const control = direct?.control ?? nested?.control ?? protoUi?.control;
  if (dropzone && control === 'json') {
    return 'dropzone-json' as FieldTypes;
  }

  return;
}

export function getFieldUiConfig(field: ParsedField): {
  control?: FieldTypes;
  placeholder?: string;
  example?: string;
  help?: string;
  description?: string;
  visibleWhen?: AutoFormUiRule[];
  disabledWhen?: AutoFormUiRule[];
  step?: string;
  summaryLabel?: string;
  optionGroups?: AutoFormOptionGroup[];
  optionLabels?: Record<string, string>;
} {
  const protoUi = getProtoFieldCustomData(field)?.ui;
  const customData = isRecord(field.fieldConfig?.customData) ? field.fieldConfig.customData : undefined;
  const nestedUi = customData && isRecord(customData.ui) ? customData.ui : undefined;

  const direct = customData
    ? {
        control: typeof customData.control === 'string' ? (customData.control as FieldTypes) : undefined,
        placeholder: typeof customData.placeholder === 'string' ? customData.placeholder : undefined,
        example: typeof customData.example === 'string' ? customData.example : undefined,
        help: typeof customData.help === 'string' ? customData.help : undefined,
        description: typeof customData.description === 'string' ? customData.description : undefined,
        visibleWhen: toUiRules(customData.visibleWhen),
        disabledWhen: toUiRules(customData.disabledWhen),
        step: typeof customData.step === 'string' ? customData.step : undefined,
        summaryLabel: typeof customData.summaryLabel === 'string' ? customData.summaryLabel : undefined,
        optionGroups: toOptionGroups(customData.optionGroups),
        optionLabels: isRecord(customData.optionLabels)
          ? (customData.optionLabels as Record<string, string>)
          : undefined,
      }
    : undefined;

  const nested = nestedUi
    ? {
        control: typeof nestedUi.control === 'string' ? (nestedUi.control as FieldTypes) : undefined,
        placeholder: typeof nestedUi.placeholder === 'string' ? nestedUi.placeholder : undefined,
        example: typeof nestedUi.example === 'string' ? nestedUi.example : undefined,
        help: typeof nestedUi.help === 'string' ? nestedUi.help : undefined,
        description: typeof nestedUi.description === 'string' ? nestedUi.description : undefined,
        visibleWhen: toUiRules(nestedUi.visibleWhen),
        disabledWhen: toUiRules(nestedUi.disabledWhen),
        step: typeof nestedUi.step === 'string' ? nestedUi.step : undefined,
        summaryLabel: typeof nestedUi.summaryLabel === 'string' ? nestedUi.summaryLabel : undefined,
        optionGroups: toOptionGroups(nestedUi.optionGroups),
        optionLabels: isRecord(nestedUi.optionLabels) ? (nestedUi.optionLabels as Record<string, string>) : undefined,
      }
    : undefined;

  // Proto-level widget annotations (data_provider, dropzone) override the
  // plain control. A string field annotated with `data_provider` should
  // render as `dataProviderSelect` regardless of any `CONTROL_TYPE_TEXT`
  // default; a JSON field annotated with `dropzone: true` should render
  // as `dropzone-json` rather than the default JSON editor. Keeping this
  // override inside `getFieldUiConfig` means the existing `resolveFieldType`
  // short-circuit (which prefers explicit control over the registry) stays
  // intact while still selecting the right widget.
  const annotatedControl = deriveAnnotatedControl(field.type, protoUi, nested, direct);

  return {
    ...(protoUi ?? {}),
    ...(nested ?? {}),
    ...(direct ?? {}),
    control:
      (typeof field.fieldConfig?.fieldType === 'string' ? (field.fieldConfig.fieldType as FieldTypes) : undefined) ||
      annotatedControl ||
      direct?.control ||
      nested?.control ||
      (protoUi?.control as FieldTypes | undefined),
    placeholder:
      (typeof field.fieldConfig?.inputProps?.placeholder === 'string'
        ? (field.fieldConfig.inputProps.placeholder as string)
        : undefined) ||
      direct?.placeholder ||
      nested?.placeholder ||
      protoUi?.placeholder,
    example: direct?.example || nested?.example || protoUi?.example,
    help: direct?.help || nested?.help || protoUi?.help,
    description: direct?.description || nested?.description || protoUi?.description,
    visibleWhen: direct?.visibleWhen || nested?.visibleWhen || protoUi?.visibleWhen,
    disabledWhen: direct?.disabledWhen || nested?.disabledWhen || protoUi?.disabledWhen,
    step: direct?.step || nested?.step || protoUi?.step,
    summaryLabel: direct?.summaryLabel || nested?.summaryLabel || protoUi?.summaryLabel,
    optionGroups: direct?.optionGroups || nested?.optionGroups,
    optionLabels: direct?.optionLabels || nested?.optionLabels,
  };
}

export function getRootErrorMessage(rootError: unknown): string | undefined {
  if (!rootError) {
    return;
  }

  if (typeof rootError === 'string') {
    return rootError;
  }

  if (typeof rootError === 'object') {
    const errorRecord = rootError as Record<string, unknown>;
    if (typeof errorRecord.message === 'string') {
      return errorRecord.message;
    }

    return Object.values(errorRecord)
      .map((value) => getRootErrorMessage(value))
      .filter((message): message is string => Boolean(message))
      .join('\n');
  }

  return;
}

export function getFieldErrorMessage(errors: unknown, path: string[]): string | undefined {
  const nestedError = getPathInObject(errors as Record<string, unknown>, path);
  const message = nestedError?.message;
  return typeof message === 'string' ? message : undefined;
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

export function createEmptyFieldValue(field: ParsedField | undefined): unknown {
  if (!field) {
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
      return protoData?.supportsUnset && !field.required ? undefined : false;
    case 'select':
      return field.required && field.options?.length ? Number(field.options[0][0]) || field.options[0][0] : undefined;
    case 'fieldMask':
      return [];
    case 'json':
      switch (protoData?.jsonKind) {
        case 'listValue':
          return [];
        case 'any':
          return { typeUrl: '', valueBase64: '' };
        default:
          return {};
      }
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
  if (!field) {
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
  return Boolean(keyField && valueField && isKeyValueScalarField(keyField) && isKeyValueScalarField(valueField));
}

export function resolveRenderFieldType(field: ParsedField): FieldTypes {
  const uiConfig = getFieldUiConfig(field);
  if (uiConfig.control) {
    return uiConfig.control;
  }

  const label = String(field.fieldConfig?.label ?? getLabel(field));
  const identity = `${field.key} ${label}`.toLowerCase();
  const inputType = String(field.fieldConfig?.inputProps?.type ?? getProtoFieldCustomData(field)?.inputType ?? '');
  const maxLength = Number(field.fieldConfig?.inputProps?.maxLength ?? 0);

  if (field.type === 'boolean') {
    const protoData = getProtoFieldCustomData(field);
    if (protoData?.supportsUnset && !field.required) {
      return 'boolean';
    }
    if (CONSENT_FIELD_PATTERN.test(identity)) {
      return 'checkbox';
    }
    return 'switch';
  }

  if (field.type === 'select') {
    const optionCount = field.options?.length ?? 0;
    if (optionCount > 8) {
      return 'combobox';
    }
    if (optionCount > 0 && optionCount <= 3) {
      return 'radio';
    }
    return 'select';
  }

  if (field.type === 'string') {
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
  }

  if (field.type === 'number') {
    const min = Number(field.fieldConfig?.inputProps?.min);
    const max = Number(field.fieldConfig?.inputProps?.max);

    // NOTE: `sliderFieldDefinition.match` no longer auto-promotes number
    // fields with min/max to the slider widget — slider is opt-in via the
    // proto `control = CONTROL_TYPE_SLIDER` annotation (see
    // `fields/slider.tsx`). This fallback resolver still returns 'slider'
    // for bounded numbers because `buildFallbackHelp` below reads it to
    // suppress a redundant range hint; the actual rendered widget is
    // decided by the registry + `getFieldUiConfig.control` override, not
    // this function. If you're trying to "fix" a number field that's
    // rendering as plain when you expected a slider, add the proto
    // annotation — don't change this branch.
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return 'slider';
    }
  }

  if (field.type === 'array') {
    const itemField = field.schema?.[0];
    if (itemField?.type === 'select' && itemField.options?.length) {
      return 'multiselect';
    }
    if (isSimpleKeyValueLikeObject(itemField)) {
      return 'keyValue';
    }
  }

  if (field.type === 'map') {
    const keyField = field.schema?.[0];
    const valueField = field.schema?.[1];
    if (isKeyValueScalarField(keyField) && isKeyValueScalarField(valueField)) {
      return 'keyValue';
    }
  }

  return field.type as FieldTypes;
}

function buildRangeHint(field: ParsedField): string | undefined {
  const min = field.fieldConfig?.inputProps?.min;
  const max = field.fieldConfig?.inputProps?.max;

  // Number.isFinite() matches resolveRenderFieldType's check — NaN/Infinity
  // passing as `number` would otherwise produce nonsense like
  // "Accepted range: NaN to Infinity".
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return `Accepted range: ${min} to ${max}.`;
  }
  if (Number.isFinite(min)) {
    return `Accepted minimum: ${min}.`;
  }
  if (Number.isFinite(max)) {
    return `Accepted maximum: ${max}.`;
  }

  return;
}

function buildFallbackHelp(field: ParsedField): string {
  const renderType = resolveRenderFieldType(field);
  const hints = [
    field.fieldConfig?.inputProps?.pattern ? 'Follow the expected format for this value.' : undefined,
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
 * Tooltip text (shown when hovering the info icon).
 * Pulls from proto `help` annotation. Only shown when it adds information
 * beyond what's already visible in the inline description.
 */
export function getFieldHelpText(field: ParsedField): string {
  const uiConfig = getFieldUiConfig(field);
  const descriptionText = getFieldDescriptionText(field);

  // Build the tooltip from help + example
  const parts = [uiConfig.help, uiConfig.example ? `Example: ${uiConfig.example}` : undefined].filter(
    (value): value is string => Boolean(value)
  );

  const tooltip = [...new Set(parts)].join(' ');

  // If tooltip would be identical to the inline description, suppress it
  // so the info icon doesn't appear redundantly.
  if (tooltip && tooltip === descriptionText) {
    return '';
  }

  return tooltip;
}

/**
 * Upstream docs URL annotated on the field. Surfaces as a "Learn more"
 * anchor in the field's description slot — so model catalogs, region
 * lists, and API parameter references always point at the vendor's
 * live list rather than a static snapshot maintained inside this repo.
 */
export function getFieldDocsUrl(field: ParsedField): string | undefined {
  const customData = field.fieldConfig?.customData;
  if (!(customData && typeof customData === 'object')) {
    return;
  }
  const bag = customData as { docsUrl?: unknown; ui?: { docsUrl?: unknown } };
  if (typeof bag.docsUrl === 'string' && bag.docsUrl) {
    return bag.docsUrl;
  }
  if (bag.ui && typeof bag.ui === 'object' && typeof bag.ui.docsUrl === 'string' && bag.ui.docsUrl) {
    return bag.ui.docsUrl;
  }
  return;
}

/**
 * Inline description text (shown directly below the input field).
 * Prefers proto `description` annotation (concise one-liner), falls back to
 * `help`, then to auto-generated fallback hints.
 */
export function getFieldDescriptionText(field: ParsedField): string | undefined {
  const uiConfig = getFieldUiConfig(field);

  // 1. Prefer explicit proto `description` annotation
  if (uiConfig.description) {
    return uiConfig.description;
  }

  // 2. Fall back to fieldConfig.description (set programmatically)
  const configDescription =
    typeof field.fieldConfig?.description === 'string' ? field.fieldConfig.description : undefined;
  if (configDescription) {
    return configDescription;
  }

  // 3. Fall back to help text (when no separate description exists)
  if (uiConfig.help) {
    return uiConfig.help;
  }

  // 4. Fall back to example
  if (uiConfig.example) {
    return `Example: ${uiConfig.example}`;
  }

  // 5. Fall back to auto-generated hints
  const fallback = buildFallbackHelp(field);
  return fallback.length > 0 ? fallback : undefined;
}

function hasSimpleRequiredCount(field: ParsedField): boolean {
  const protoData = getProtoFieldCustomData(field);
  return Boolean((protoData?.minItems ?? 0) > 0 || (protoData?.minPairs ?? 0) > 0);
}

/**
 * Default classification: required fields are "simple", optional fields are "advanced".
 * Can be overridden via explicit `advanced` metadata in field config or the `classifyField` prop.
 */
export function defaultClassifyField(field: ParsedField): 'simple' | 'advanced' {
  const customData = isRecord(field.fieldConfig?.customData) ? field.fieldConfig.customData : undefined;
  if (customData?.advanced === true) {
    return 'advanced';
  }
  if (customData?.advanced === false) {
    return 'simple';
  }
  return field.required || hasSimpleRequiredCount(field) ? 'simple' : 'advanced';
}

export function deriveSimpleFields(
  fields: ParsedField[] | undefined,
  classifyField: (field: ParsedField) => 'simple' | 'advanced' = defaultClassifyField
): ParsedField[] {
  if (!fields) {
    return [];
  }

  return sortFieldsByOrder(
    fields.flatMap((field) => {
      const simpleChildren = deriveSimpleFields(field.schema, classifyField);
      const hasRequiredDescendants = simpleChildren.length > 0;
      const classification = classifyField(field);
      const isSimple = classification === 'simple';

      if (field.type === 'object') {
        if (isSimple && !hasRequiredDescendants && field.schema?.length) {
          return [{ ...field, schema: field.schema }];
        }
        if (isSimple || hasRequiredDescendants) {
          return [{ ...field, schema: hasRequiredDescendants ? simpleChildren : field.schema }];
        }
        return [];
      }

      if (field.type === 'oneof') {
        if (isSimple || hasRequiredDescendants) {
          return [{ ...field, schema: field.schema }];
        }
        return [];
      }

      if (field.type === 'array' || field.type === 'map') {
        if (isSimple || hasRequiredDescendants) {
          return [{ ...field, schema: hasRequiredDescendants ? simpleChildren : field.schema }];
        }
        return [];
      }

      return isSimple ? [field] : [];
    })
  );
}

export function collectLeafFieldPaths(fields: ParsedField[], path: string[] = []): string[] {
  return fields.flatMap((field) => {
    const nextPath = [...path, field.key];
    const renderType = resolveRenderFieldType(field);

    if (renderType === 'object' || renderType === 'array' || renderType === 'map' || renderType === 'oneof') {
      return field.schema?.length ? collectLeafFieldPaths(field.schema, nextPath) : [nextPath.join('.')];
    }

    return [nextPath.join('.')];
  });
}

export function filterFieldsByPaths(fields: ParsedField[], paths: string[], currentPath: string[] = []): ParsedField[] {
  if (paths.length === 0) {
    return [];
  }

  return sortFieldsByOrder(
    fields.flatMap((field) => {
      const nextPath = [...currentPath, field.key];
      const fullPath = nextPath.join('.');
      const matchesDirectly = paths.some((path) => path === fullPath);
      const hasDescendantMatch = paths.some((path) => path.startsWith(`${fullPath}.`));

      if (!(matchesDirectly || hasDescendantMatch)) {
        return [];
      }

      if (!field.schema?.length || matchesDirectly) {
        return [
          {
            ...field,
            schema: matchesDirectly ? field.schema : filterFieldsByPaths(field.schema ?? [], paths, nextPath),
          },
        ];
      }

      return [{ ...field, schema: filterFieldsByPaths(field.schema, paths, nextPath) }];
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

    if (field.type === 'object' && isRecord(value) && field.schema?.length) {
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
  return String(value);
}

export function flattenSummaryEntries(
  payload: unknown,
  prefix = ''
): Array<{ key: string; value: unknown; isComplex: boolean }> {
  if (!isRecord(payload)) {
    return [];
  }

  return Object.entries(payload).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
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

export function normalizeKeyValueEntries(value: unknown): Array<{ key: string; value: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      return { key: '', value: '' };
    }

    return {
      key: entry.key === undefined || entry.key === null ? '' : String(entry.key),
      value: entry.value === undefined || entry.value === null ? '' : String(entry.value),
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
  if (!field) {
    return value;
  }

  const renderType = resolveRenderFieldType(field);
  if (renderType === 'number') {
    return value === '' ? undefined : Number(value);
  }
  if (renderType === 'int64') {
    return value;
  }
  if (renderType === 'select' && field.options?.every(([optionValue]) => NUMERIC_OPTION_PATTERN.test(optionValue))) {
    return value === '' ? undefined : Number(value);
  }
  return value;
}
