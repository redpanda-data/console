/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * Shared pure YAML helpers for extracting component names from parsed YAML objects.
 * Used by both pipeline-flow-parser.ts and yaml.ts.
 */

/** Keys that appear as siblings to the actual component name (e.g. `label`). */
const RESERVED_COMPONENT_KEYS = new Set(['label']);

/** Extract the component name from an object, skipping reserved metadata keys like `label`. */
export const firstKey = (obj: unknown): string | undefined => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return;
  }
  return Object.keys(obj).find((k) => !RESERVED_COMPONENT_KEYS.has(k));
};

/** Extract child input names from a multi-input component (broker, sequence). */
export const parseMultiInputs = (inputKey: string, value: unknown): string[] | undefined => {
  if (
    (inputKey === 'broker' || inputKey === 'sequence') &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'inputs' in value
  ) {
    const items = (value as { inputs?: unknown[] }).inputs;
    if (Array.isArray(items)) {
      return items.map(firstKey).filter((k): k is string => !!k);
    }
  }
  return;
};

/** Extract child output names from a multi-output component (broker, switch, fallback). */
export const parseMultiOutputs = (outputKey: string, value: unknown): string[] | undefined => {
  if (outputKey === 'broker' && value && typeof value === 'object' && !Array.isArray(value) && 'outputs' in value) {
    const items = (value as { outputs?: unknown[] }).outputs;
    if (Array.isArray(items)) {
      return items.map(firstKey).filter((k): k is string => !!k);
    }
  }

  if (outputKey === 'switch' && value && typeof value === 'object' && !Array.isArray(value) && 'cases' in value) {
    const cases = (value as { cases?: { output?: unknown }[] }).cases;
    if (Array.isArray(cases)) {
      return cases.map((c) => firstKey(c.output)).filter((k): k is string => !!k);
    }
  }

  if (outputKey === 'fallback' && Array.isArray(value)) {
    return value.map(firstKey).filter((k): k is string => !!k);
  }

  return;
};

/**
 * Processors whose configs contain nested child `processors` arrays.
 * We intentionally do not recurse into these when extracting processor names
 * for the pipeline list display.
 */
export const PROCESSORS_WITH_NESTED_STEPS = [
  'branch',
  'catch',
  'for_each',
  'parallel',
  'switch',
  'try',
  'while',
  'workflow',
] as const;
