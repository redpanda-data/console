import type { ParsedField } from '../core-types';
import type { AutoFormStepConfig } from '../types';
import { getFieldUiConfig } from '../ui-config';

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

    if (stepId !== undefined && stepId !== '') {
      const existing = groups.get(stepId) ?? [];
      groups.set(stepId, [...existing, nextPath.join('.')]);
    }

    if (field.schema !== undefined && field.schema.length > 0) {
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
  if (explicitSteps !== undefined && explicitSteps.length > 0) {
    return explicitSteps;
  }

  if (protoSteps !== undefined && protoSteps.length > 0) {
    return protoSteps;
  }

  return collectFieldAssignedSteps(advancedFields);
}
