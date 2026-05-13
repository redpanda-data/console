'use client';

import { format, isValid, parse } from 'date-fns';
import React from 'react';

import { Input } from '../../input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '../../input-group';
import { useAutoFormRuntimeContext } from '../context';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig, NUMERIC_OPTION_PATTERN } from '../helpers';
import { getAutoFormChoiceTestId, getAutoFormFieldTestId } from '../test-ids';
import type { AutoFormOptionGroup, AutoFormOptionItem } from '../types';

// ---------------------------------------------------------------------------
// Label utilities
// ---------------------------------------------------------------------------

export function getControlLabel(label: AutoFormFieldProps['label'], field: AutoFormFieldProps['field']): string {
  return typeof label === 'string' || typeof label === 'number'
    ? String(label)
    : String(field.fieldConfig?.label ?? field.key);
}

// ---------------------------------------------------------------------------
// Test-id utilities
// ---------------------------------------------------------------------------

export function useFieldTestIds(id: string) {
  const { testIdPrefix } = useAutoFormRuntimeContext();

  return React.useMemo(
    () => ({
      control: getAutoFormFieldTestId(testIdPrefix, id, 'control'),
      controlPart: (part: string) => getAutoFormFieldTestId(testIdPrefix, id, `control-${part}`),
      field: getAutoFormFieldTestId(testIdPrefix, id),
      group: (group: string | number) => getAutoFormChoiceTestId(testIdPrefix, id, 'group', group),
      option: (value: string | number) => getAutoFormChoiceTestId(testIdPrefix, id, 'option', value),
      selected: (value: string | number) => getAutoFormChoiceTestId(testIdPrefix, id, 'selected', value),
    }),
    [id, testIdPrefix]
  );
}

export function resolveControlTestId(inputProps: AutoFormFieldProps['inputProps'], fallback: string): string {
  return typeof (inputProps as { testId?: unknown }).testId === 'string'
    ? ((inputProps as { testId: string }).testId ?? fallback)
    : fallback;
}

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

export function normalizeDateValue(value: unknown): string {
  if (typeof value === 'string') {
    if (/([+-]\d{2}:\d{2}|Z)$/.test(value)) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? '' : format(parsed, 'yyyy-MM-dd');
    }

    return value.includes('T') ? (value.split('T')[0] ?? '') : value;
  }

  if (value instanceof Date && isValid(value)) {
    return format(value, 'yyyy-MM-dd');
  }

  return '';
}

export function normalizeTimeValue(value: unknown): string {
  if (typeof value === 'string') {
    if (/([+-]\d{2}:\d{2}|Z)$/.test(value)) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? '' : format(parsed, 'HH:mm');
    }

    return value.includes('T') ? (value.split('T')[1]?.slice(0, 5) ?? '') : '';
  }

  if (value instanceof Date && isValid(value)) {
    return format(value, 'HH:mm');
  }

  return '';
}

export function parseCalendarDate(value: string): Date | undefined {
  if (!value) {
    return;
  }

  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? parsed : undefined;
}

export function buildTimestampValue(datePart: string, timePart: string): string {
  if (!datePart) {
    return '';
  }

  return `${datePart}T${timePart || '00:00'}`;
}

// ---------------------------------------------------------------------------
// Number utilities
// ---------------------------------------------------------------------------

export function parseNumericProp(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return;
}

export function resolveNumericStep(inputProps: AutoFormFieldProps['inputProps'], fallbackValue?: number): number {
  const explicitStep = parseNumericProp(inputProps.step);
  if (explicitStep !== undefined && explicitStep > 0) {
    return explicitStep;
  }

  const values = [parseNumericProp(inputProps.min), parseNumericProp(inputProps.max), fallbackValue].filter(
    (value): value is number => value !== undefined
  );
  return values.some((value) => !Number.isInteger(value)) ? 0.01 : 1;
}

export function normalizeNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return;
}

// ---------------------------------------------------------------------------
// Option utilities
// ---------------------------------------------------------------------------

export function getGroupedOptions(field: AutoFormFieldProps['field']): AutoFormOptionGroup[] | undefined {
  return getFieldUiConfig(field).optionGroups;
}

export function getFlatOptions(field: AutoFormFieldProps['field']): AutoFormOptionItem[] {
  const uiConfig = getFieldUiConfig(field);
  const labelOverrides = uiConfig.optionLabels;
  const optionGroups = getGroupedOptions(field);

  if (optionGroups?.length) {
    const options = optionGroups.flatMap((group) => group.options);
    if (labelOverrides) {
      return options.map((opt) => ({ ...opt, label: labelOverrides[opt.value] ?? opt.label }));
    }
    return options;
  }

  return (field.options || []).map(([value, label]) => ({
    value,
    label: labelOverrides?.[value] ?? label,
  }));
}

export function renderOptionLabel(option: AutoFormOptionItem | { label?: React.ReactNode; value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {'icon' in option && option.icon ? <span className="shrink-0">{option.icon}</span> : null}
      <span className="truncate">{option.label ?? option.value}</span>
    </span>
  );
}

export function hasNumericOptions(field: AutoFormFieldProps['field']): boolean {
  const options = getFlatOptions(field);
  return options.length > 0 && options.every((option) => NUMERIC_OPTION_PATTERN.test(option.value));
}

// ---------------------------------------------------------------------------
// Shared input component
// ---------------------------------------------------------------------------

export function StringLikeInput({
  error,
  icon,
  id,
  inputProps,
  placeholder,
  testId,
  type = 'text',
}: {
  error?: string;
  icon?: React.ReactNode;
  id: string;
  inputProps: AutoFormFieldProps['inputProps'];
  placeholder?: string;
  testId: string;
  type?: React.ComponentProps<typeof Input>['type'];
}) {
  if (icon) {
    return (
      <InputGroup testId={testId}>
        <InputGroupAddon>
          <InputGroupText>{icon}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-invalid={Boolean(error)}
          disabled={inputProps.disabled}
          id={id}
          onBlur={inputProps.onBlur}
          onChange={(event) => inputProps.onValueChange(event.target.value)}
          placeholder={placeholder}
          testId={`${testId}-input`}
          type={type}
          value={(inputProps.value as string | undefined) ?? ''}
        />
      </InputGroup>
    );
  }

  return (
    <Input
      aria-invalid={Boolean(error)}
      className={error ? 'border-destructive' : ''}
      disabled={inputProps.disabled}
      id={id}
      onBlur={inputProps.onBlur}
      onChange={(event) => inputProps.onValueChange(event.target.value)}
      placeholder={placeholder}
      testId={testId}
      type={type}
      value={(inputProps.value as string | undefined) ?? ''}
    />
  );
}

/**
 * Extract the registered data-provider id from a field's customData.
 * Accepts both the flat `customData.dataProvider` shape and the proto-derived
 * `customData.ui.dataProvider` shape so authors can use either.
 */
export function readDataProviderId(field: AutoFormFieldProps['field'] | undefined): string | undefined {
  const customData = field?.fieldConfig?.customData;
  if (!(customData && typeof customData === 'object')) {
    return;
  }
  const bag = customData as { dataProvider?: unknown; ui?: { dataProvider?: unknown } };
  if (typeof bag.dataProvider === 'string') {
    return bag.dataProvider;
  }
  if (bag.ui && typeof bag.ui === 'object' && typeof bag.ui.dataProvider === 'string') {
    return bag.ui.dataProvider;
  }
  return;
}
