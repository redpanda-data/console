// Copyright 2026 Redpanda Data, Inc.

import { isObject, isUnknownArray } from '../../../../../utils/type-guards';

type ConfigPathStep = string | number | readonly [string | number, true];

/** Read unknown generated config without asserting a schema; preserve optional-chain short circuiting. */
export function configValue(value: unknown, ...path: ConfigPathStep[]): unknown {
  let current = value;
  for (const step of path) {
    const optional = typeof step === 'object';
    const key = optional ? step[0] : step;
    if (optional && (current === null || current === undefined)) {
      return undefined;
    }
    if (!isObject(current)) {
      throw new TypeError(`Expected config object while reading ${key}`);
    }
    current = current[key];
  }
  return current;
}

export function configArray(value: unknown): unknown[] {
  if (!isUnknownArray(value)) {
    throw new TypeError('Expected a config array');
  }
  return value;
}

export function configRecord(value: unknown): Record<string, unknown> {
  if (!isObject(value) || Array.isArray(value)) {
    throw new TypeError('Expected a config map');
  }
  return value;
}

export function configString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Expected serialized YAML');
  }
  return value;
}
