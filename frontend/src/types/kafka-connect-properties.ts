/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { type ConnectorGroup, type ConnectorProperty, type ConnectorStep, DataType } from './kafka-connect';
import type { Secret } from '../state/connect/state';
import { arrayIsEqual, arrayPushDistinct, arrayRemove, arrayUpdateWith } from '../utils/array-utils';
import { isNonEmptyString } from '../utils/string-utils';
import { isObject, isUnknownArray } from '../utils/type-guards';

/** Kafka Connect form values are scalars or string lists; reject unrepresentable JSON before mutating form state. */
export function parsePropertyValue(value: unknown): Property['value'] {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (isUnknownArray(value) && value.every((item): item is string => typeof item === 'string')) {
    return value;
  }
  throw new TypeError('Connector property values must be a scalar, null, or a list of strings.');
}

const sanitizeBoolean = (val: Property['value']) => {
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'string') {
    const lVal = val.toLowerCase();
    if (lVal === 'true') {
      return true;
    }
    if (lVal === 'false') {
      return false;
    }
    return val;
  }
  return false;
};

const sanitizeNumber = (val: Property['value']) => {
  const n = Number.parseFloat(String(val));
  return Number.isFinite(n) ? n : null;
};

function sanitizeDefaultValue(value: Property['value'], type: string) {
  switch (type) {
    case DataType.Boolean:
      return sanitizeBoolean(value);
    case DataType.Int:
    case DataType.Long:
    case DataType.Short:
      return sanitizeNumber(value);
    default:
      return value;
  }
}

export function sanitizeValue(value: Property['value'], type: string) {
  switch (type) {
    case DataType.Boolean:
      return sanitizeBoolean(value);
    default:
      return value;
  }
}

export function parseConfigJson(jsonText: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    return isObject(parsed) && !isUnknownArray(parsed) ? parsed : {};
  } catch {
    // no op - JSON may be invalid during editing
    return {};
  }
}

// Whether a property's value goes into the submitted config. Optional values still at their default
// are left out, so the connector keeps following the default.
export function isSubmittedProperty(p: Property, config: Record<string, unknown>): boolean {
  if (p.entry.definition.required) {
    return true;
  }
  if (p.value === p.entry.definition.default_value) {
    // Prevent sending configs set to default when the user has not modified them.

    // let's ignore the default variable if the value is the same as initially rendered
    // otherwise, user might want to set it back to default
    if (p.value === p.entry.value.value) {
      return false;
    }
    // let's ignore the variable if the original value is null and the config is not present in current set configs values.
    if (p.entry.value.value === null && !Boolean(config[p.name])) {
      return false;
    }
  }
  // skip boolean values that default to false
  return !(p.value === false && !isNonEmptyString(p.entry.definition.default_value));
}

export function applyCustomDefaults(allProps: Property[]) {
  // Set default values
  for (const p of allProps) {
    if (p.entry.definition.custom_default_value !== undefined) {
      p.value = p.entry.definition.custom_default_value;
    }
  }

  // Set last error values, so we know when to show the validation error
  for (const p of allProps) {
    if (p.errors.length > 0) {
      p.lastErrorValue = p.value;
    }
  }
}

export function linkPropertiesToGroups(groups: PropertyGroup[]) {
  // Let properties know about their parent group, so they can add/remove themselves in 'propertiesWithErrors'
  for (const g of groups) {
    for (const p of g.properties) {
      p.propertyGroup = g;
    }
  }

  // Notify groups about errors in their children
  for (const g of groups) {
    g.propertiesWithErrors.push(...g.properties.filter((p) => p.showErrors));
  }
}

// The group's position across all steps' groups; a group no step lists sorts last.
export function stepGroupOrder(steps: ConnectorStep[], groupName: string | undefined): number {
  let order = 0;
  for (const s of steps) {
    for (const g of s.groups) {
      if (groupName === g.name) {
        return order;
      }
      order += 1;
    }
  }

  return order;
}

export function syncRecommendedValues(target: Property, source: Property) {
  const suggestedSrc = source.entry.value.recommended_values;
  const suggestedTar = target.entry.value.recommended_values;
  if (!arrayIsEqual(suggestedSrc, suggestedTar)) {
    arrayUpdateWith(suggestedTar, suggestedSrc);
  }
}

// Show the first error, skipping over simple / unhelpful messages when there are several.
function firstHelpfulErrorIndex(errors: string[]): number {
  if (errors.length <= 1) {
    return 0;
  }
  const betterStartValue = errors.findIndex((x) => !x.includes('which has no default value'));
  return betterStartValue > -1 ? betterStartValue : 0;
}

export function updatePropertyErrors(target: Property, errors: string[]) {
  if (errors.length > 0) {
    target.lastErrors = [...errors]; // create copy
  }

  // Update
  arrayUpdateWith(target.errors, errors);
  target.showErrors = target.errors.length > 0;
  target.currentErrorIndex = firstHelpfulErrorIndex(target.errors);

  // Add or remove from parent group
  if (target.propertyGroup) {
    if (target.errors.length > 0) {
      arrayPushDistinct(target.propertyGroup.propertiesWithErrors, target);
    } else {
      arrayRemove(target.propertyGroup.propertiesWithErrors, target);
    }
  }
}

// Fix type of default values
export function initialPropertyValue(p: ConnectorProperty): Property['value'] {
  const defaultValue = sanitizeDefaultValue(p.definition.default_value, p.definition.type);
  const initialValue = sanitizeValue(p.value.value, p.definition.type);
  return initialValue ?? defaultValue;
}

// Writes to the property's value also land in its secret.
export function bindSecretValue(property: Property, secret: Secret) {
  secret.extractSecretId(String(property.value));

  // Instead of intercept, we'll use a custom setter pattern
  // Store original value
  let currentValue = property.value;
  Object.defineProperty(property, 'value', {
    get() {
      return currentValue;
    },
    set(newValue: Property['value']) {
      currentValue = newValue;
      secret.value = String(newValue);
    },
    enumerable: true,
    configurable: true,
  });
}

export type PropertyGroup = {
  step: ConnectorStep;
  group: ConnectorGroup;

  properties: Property[];

  readonly filteredProperties: Property[];

  propertiesWithErrors: Property[];

  description?: string;
  documentation_link?: string;
};

export type Property = {
  name: string;
  entry: ConnectorProperty;
  value: null | string | number | boolean | string[];
  isHidden: boolean; // currently only used for "connector.class"
  errors: string[]; // current errors
  showErrors: boolean; // true = property has errors currently
  lastErrors: string[]; // previous errors, used so we can fade/animate them out when they get fixed
  currentErrorIndex: number; // since we can only display one error at a time, we use this to cycle through
  lastErrorValue: unknown; // the 'value' the property had at the last validation check (used so we can immediately hide the reported error once the user changes the value)

  propertyGroup?: PropertyGroup;
  crud: 'create' | 'update';
  isDisabled: boolean | undefined;
  notifyChange: () => void;
};
