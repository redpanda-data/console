// Copyright 2026 Redpanda Data, Inc.

import { isValidElement, type ReactNode, type ReactPortal } from 'react';
import { getProtoFieldCustomData } from '../../lib/protobuf-provider/metadata';
import { omitUndefined } from '../../lib/utils/omit-undefined';
import type { ParsedField } from './core-types';
import { getRenderableText } from './field-utils';
import type { AutoFormOptionGroup, AutoFormOptionItem, AutoFormUiRule } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, label] of Object.entries(value)) {
    if (typeof label !== 'string') {
      throw new TypeError('Option labels must be strings.');
    }
    result[key] = label;
  }
  return result;
}

function toUiRules(value: unknown): AutoFormUiRule[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }

  const rules: AutoFormUiRule[] = [];

  for (const rule of value) {
    if (!isRecord(rule) || typeof rule['expression'] !== 'string') {
      continue;
    }

    rules.push(
      omitUndefined({
        id: typeof rule['id'] === 'string' ? rule['id'] : undefined,
        expression: rule['expression'],
        message: typeof rule['message'] === 'string' ? rule['message'] : undefined,
      })
    );
  }

  return rules.length > 0 ? rules : undefined;
}

function isReactPortal(value: unknown): value is ReactPortal {
  return isRecord(value) && value['$$typeof'] === Symbol.for('react.portal') && 'children' in value;
}

function isIterable(value: object): value is Iterable<unknown> {
  return Symbol.iterator in value && typeof value[Symbol.iterator] === 'function';
}

// Keep resource and one-shot iterator identity stable across the multiple metadata
// reads used by matching, descriptions and the eventual field renderer.
const iconPromises = new WeakMap<Promise<unknown>, Promise<Awaited<ReactNode>>>();
const iconIterables = new WeakMap<Iterable<unknown>, ReactNode[]>();

function parseOptionIcon(value: unknown): ReactNode {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    isValidElement(value) ||
    isReactPortal(value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((child: unknown) => parseOptionIcon(child));
  }
  if (value instanceof Promise) {
    const cached = iconPromises.get(value);
    if (cached !== undefined) {
      return cached;
    }
    const parsed = value.then((child: unknown) => parseOptionIcon(child));
    iconPromises.set(value, parsed);
    return parsed;
  }
  if (typeof value === 'object' && isIterable(value)) {
    const cached = iconIterables.get(value);
    if (cached !== undefined) {
      return cached;
    }
    const parsed = Array.from(value, parseOptionIcon);
    iconIterables.set(value, parsed);
    return parsed;
  }
  throw new TypeError('Option icons must be renderable React nodes.');
}

function toOptionItem(value: unknown): AutoFormOptionItem | undefined {
  if (!isRecord(value) || typeof value['value'] !== 'string') {
    return;
  }

  return {
    value: value['value'],
    label: nonEmptyString(getRenderableText(value['label'])),
    icon: parseOptionIcon(value['icon']),
  };
}

function toOptionGroups(value: unknown): AutoFormOptionGroup[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }

  const groups: AutoFormOptionGroup[] = [];

  for (const candidate of value) {
    if (!(isRecord(candidate) && Array.isArray(candidate['options']))) {
      continue;
    }

    const options = candidate['options']
      .map(toOptionItem)
      .filter((option): option is AutoFormOptionItem => Boolean(option));
    if (options.length === 0) {
      continue;
    }

    groups.push({
      label: nonEmptyString(getRenderableText(candidate['label'])),
      options,
    });
  }

  return groups.length > 0 ? groups : undefined;
}

interface AnnotatedUi {
  control?: unknown;
  dataProvider?: unknown;
  dropzone?: unknown;
}

// `deriveAnnotatedControl` must skip complex types: a `repeated string`
// annotated with `data_provider` would otherwise short-circuit to
// `dataProviderSelect` on the array itself, bypassing the Add-button UI.
// The annotation still reaches each item via the array's schema[0] template.
function isComplexFieldType(type: unknown): boolean {
  return type === 'array' || type === 'map' || type === 'object';
}

// Picks the widget override from annotations: `dataProvider` wins (opinionated
// dropdown), else `dropzone` + `control === 'json'` (JSON editor), else undefined
// so the normal control/type path resolves. Reads all three UI sources.
function deriveAnnotatedControl(
  fieldType: unknown,
  protoUi: AnnotatedUi | undefined,
  nested: AnnotatedUi | undefined,
  direct: AnnotatedUi | undefined
): string | undefined {
  if (isComplexFieldType(fieldType)) {
    return;
  }

  const dataProvider =
    nonEmptyString(direct?.dataProvider) ??
    nonEmptyString(nested?.dataProvider) ??
    nonEmptyString(protoUi?.dataProvider);
  if (dataProvider !== undefined && dataProvider !== '') {
    return 'dataProviderSelect';
  }

  const dropzone = direct?.dropzone === true || nested?.dropzone === true || protoUi?.dropzone === true;
  const control = direct?.control ?? nested?.control ?? protoUi?.control;
  if (dropzone && control === 'json') {
    return 'dropzone-json';
  }
  return undefined;
}

export interface FieldUiConfig {
  control?: string;
  description?: string;
  disabledWhen?: AutoFormUiRule[];
  example?: string;
  help?: string;
  optionGroups?: AutoFormOptionGroup[];
  optionLabels?: Record<string, string>;
  placeholder?: string;
  step?: string;
  summaryLabel?: string;
  supportsUnset?: boolean;
  visibleWhen?: AutoFormUiRule[];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionLabels(value: unknown): Record<string, string> | undefined {
  return isRecord(value) ? stringRecord(value) : undefined;
}

function readUiMetadata(value: unknown): FieldUiConfig {
  if (!isRecord(value)) {
    return {};
  }
  const supportsUnset = value['supportsUnset'];
  if (supportsUnset !== undefined && typeof supportsUnset !== 'boolean') {
    throw new TypeError('supportsUnset must be a boolean.');
  }
  return omitUndefined({
    supportsUnset,
    control: nonEmptyString(value['control']),
    placeholder: nonEmptyString(value['placeholder']),
    example: nonEmptyString(value['example']),
    help: nonEmptyString(value['help']),
    description: nonEmptyString(value['description']),
    visibleWhen: toUiRules(value['visibleWhen']),
    disabledWhen: toUiRules(value['disabledWhen']),
    step: nonEmptyString(value['step']),
    summaryLabel: nonEmptyString(value['summaryLabel']),
    optionGroups: toOptionGroups(value['optionGroups']),
    optionLabels: optionLabels(value['optionLabels']),
  });
}

export function getFieldUiConfig(field: ParsedField): FieldUiConfig {
  const protoUi = getProtoFieldCustomData(field)?.ui;
  const customData = field.fieldConfig?.customData;
  const nested = readUiMetadata(customData?.['ui']);
  const direct = readUiMetadata(customData);
  const merged = { ...protoUi, ...nested, ...direct };
  const annotatedControl = deriveAnnotatedControl(field.type, protoUi, nested, direct);
  return omitUndefined({
    ...merged,
    control: nonEmptyString(field.fieldConfig?.fieldType) ?? annotatedControl ?? merged.control,
    placeholder: nonEmptyString(field.fieldConfig?.inputProps?.['placeholder']) ?? nonEmptyString(merged.placeholder),
  });
}
