// Copyright 2026 Redpanda Data, Inc.

import { format, isValid, parse } from 'date-fns';
import type { AutoFormFieldProps } from '../core-types';
import { getRenderableText } from '../field-utils';
import { NUMERIC_OPTION_PATTERN } from '../helpers';
import type { AutoFormOptionGroup, AutoFormOptionItem } from '../types';
import { getFieldUiConfig, isRecord } from '../ui-config';

const TOP_LEVEL_REGEX_1 = /([+-]\d{2}:\d{2}|Z)$/;

export function getControlLabel(label: AutoFormFieldProps['label'], field: AutoFormFieldProps['field']): string {
  return getRenderableText(label, field.key);
}

/** Native scalar controls cannot represent structured form values without data loss. */
export function normalizeScalarInput(value: unknown): string {
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
  throw new TypeError('Expected a scalar input value; structured values require a collection or JSON field.');
}

export function resolveControlTestId(inputProps: AutoFormFieldProps['inputProps'], fallback: string): string {
  const testId = inputProps.testId;
  return typeof testId === 'string' ? testId : fallback;
}

export function normalizeDateValue(value: unknown): string {
  if (typeof value === 'string') {
    if (TOP_LEVEL_REGEX_1.test(value)) {
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
    if (TOP_LEVEL_REGEX_1.test(value)) {
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
  if (value === '') {
    return;
  }

  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? parsed : undefined;
}

export function buildTimestampValue(datePart: string, timePart: string): string {
  if (datePart === '') {
    return '';
  }

  return `${datePart}T${timePart === '' ? '00:00' : timePart}`;
}

export function parseNumericProp(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
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
  return undefined;
}

export function getGroupedOptions(field: AutoFormFieldProps['field']): AutoFormOptionGroup[] | undefined {
  return getFieldUiConfig(field).optionGroups;
}

export function getFlatOptions(field: AutoFormFieldProps['field']): AutoFormOptionItem[] {
  const uiConfig = getFieldUiConfig(field);
  const labelOverrides = uiConfig.optionLabels;
  const optionGroups = getGroupedOptions(field);

  if (optionGroups !== undefined && optionGroups.length > 0) {
    const options = optionGroups.flatMap((group) => group.options);
    if (labelOverrides !== undefined) {
      return options.map((opt) => ({ ...opt, label: labelOverrides[opt.value] ?? opt.label }));
    }
    return options;
  }

  return (field.options ?? []).map(([value, label]) => ({
    value,
    label: labelOverrides?.[value] ?? label,
  }));
}

export function hasNumericOptions(field: AutoFormFieldProps['field']): boolean {
  const options = getFlatOptions(field);
  return options.length > 0 && options.every((option) => NUMERIC_OPTION_PATTERN.test(option.value));
}

// Accepts both flat `customData.dataProvider` and proto-derived `customData.ui.dataProvider`.
export function readDataProviderId(field: AutoFormFieldProps['field'] | undefined): string | undefined {
  const customData = field?.fieldConfig?.customData;
  if (!(customData !== undefined && typeof customData === 'object')) {
    return;
  }
  if (typeof customData['dataProvider'] === 'string') {
    return customData['dataProvider'];
  }
  const ui = customData['ui'];
  if (isRecord(ui) && typeof ui['dataProvider'] === 'string') {
    return ui['dataProvider'];
  }
  return undefined;
}
