import type { ParsedField } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { AutoFormStepConfig } from '../types';

function humanizeStepId(stepId: string): string {
  return stepId
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function collectFieldAssignedSteps(
  fields: ParsedField[],
  path: string[] = [],
  groups = new Map<string, string[]>()
): AutoFormStepConfig[] {
  for (const field of fields) {
    const nextPath = [...path, field.key];
    const stepId = getFieldUiConfig(field).step;

    if (stepId) {
      const existing = groups.get(stepId) ?? [];
      groups.set(stepId, [...existing, nextPath.join('.')]);
    }

    if (field.schema?.length) {
      collectFieldAssignedSteps(field.schema, nextPath, groups);
    }
  }

  return Array.from(groups.entries()).map(([id, fieldsForStep]) => ({
    id,
    title: humanizeStepId(id),
    fields: Array.from(new Set(fieldsForStep)),
  }));
}

export function resolveStepConfig(
  advancedFields: ParsedField[],
  explicitSteps: AutoFormStepConfig[] | undefined,
  protoSteps: AutoFormStepConfig[] | undefined
): AutoFormStepConfig[] {
  if (explicitSteps?.length) {
    return explicitSteps;
  }

  if (protoSteps?.length) {
    return protoSteps;
  }

  return collectFieldAssignedSteps(advancedFields);
}
