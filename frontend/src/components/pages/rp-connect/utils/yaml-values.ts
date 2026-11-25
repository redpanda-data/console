// Copyright 2026 Redpanda Data, Inc.

import { isNonEmptyString } from '../../../../utils/string-utils';
import { isObject, isUnknownArray } from '../../../../utils/type-guards';

// `lineWidth: 0` disables folding: the lib default folds long single-line bloblang mappings at
// col 80, reformatting lines the user never touched. Every mutation stringify must use this.
export const YAML_STRINGIFY_OPTIONS = { lineWidth: 0 } as const;

/** Keys that appear as siblings to the component name (e.g. `label`, a `<<` merge key). */
const RESERVED_COMPONENT_KEYS = new Set(['label', '<<']);

/** Extract the component name from an object, skipping reserved keys like `label`. */
export const firstKey = (obj: unknown): string | undefined => {
  if (!isObject(obj) || isUnknownArray(obj)) {
    return;
  }
  return Object.keys(obj).find((k) => !RESERVED_COMPONENT_KEYS.has(k));
};

// Input and output slots also carry `processors`; there's a processor of that name, so only slots skip it.
const SLOT_SIBLING_KEYS = new Set([...RESERVED_COMPONENT_KEYS, 'processors']);

/** The component name in an input or output slot, skipping `label` and the slot's `processors`. */
export const slotComponentKey = (obj: unknown): string | undefined => {
  if (!isObject(obj) || isUnknownArray(obj)) {
    return;
  }
  return Object.keys(obj).find((k) => !SLOT_SIBLING_KEYS.has(k));
};

const YAML_TRUE = new Set(['true', 'yes', 'y', 'on']);

const YAML_FALSE = new Set(['false', 'no', 'n', 'off']);

/** A boolean field as Connect decodes it, YAML 1.1 words included; undefined for an env reference or anything else. */
export function yamlFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  const word = typeof value === 'string' ? value.trim().toLowerCase() : undefined;
  if (word === undefined) {
    return;
  }
  if (YAML_TRUE.has(word)) {
    return true;
  }
  return YAML_FALSE.has(word) ? false : undefined;
}

/** The input wrapper that gives any input a logical end. */
export const READ_UNTIL = 'read_until';

/** A `read_until` wrapper's end settings: the fields beside its child `input`. */
export type StopCondition = {
  /** Bloblang query; the input closes after the message that makes it true. */
  check?: string;
  /** Go duration; the input closes once no message has arrived for this long. */
  idleTimeout?: string;
  /** Reopen the child input when it closes before `check` is met. */
  restartInput?: boolean;
};

export type UnwrappedInput = {
  /** The object holding the input component: the slot itself, or the wrapper's `read_until.input`. */
  component: Record<string, unknown>;
  /** Path from the slot to `component` — `[]` when the slot isn't wrapped. */
  innerPath: string[];
  /** The wrapper's settings, when the slot is a `read_until`. */
  stop?: StopCondition;
};

/** The value as a plain object, or undefined for anything else (arrays included). */
export const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isObject(value) && !isUnknownArray(value) ? value : undefined;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

// Connect reads a scalar `check: true` as the query `true`.
const checkQuery = (value: unknown): string | undefined =>
  nonEmptyString(typeof value === 'boolean' || typeof value === 'number' ? String(value) : value);

// An unquoted `idle_timeout: 30` parses as a number — keep it visible rather than drop it.
const idleTimeoutText = (value: unknown): string | undefined =>
  typeof value === 'number' ? String(value) : nonEmptyString(value);

/** The settings of a parsed `read_until` value (its fields other than `input`). */
export function readStopCondition(value: unknown): StopCondition {
  const record = asRecord(value) ?? {};
  const check = checkQuery(record.check);
  const idleTimeout = idleTimeoutText(record.idle_timeout);
  return {
    ...(check !== null && check !== undefined && check !== '' ? { check } : {}),
    ...(idleTimeout !== null && idleTimeout !== undefined && idleTimeout !== '' ? { idleTimeout } : {}),
    ...(yamlFlag(record.restart_input) === true ? { restartInput: true } : {}),
  };
}

/** True when the condition can end the input — a `check` or an idle timeout. `restart_input` alone can't. */
export function isStopConditionSet(stop: StopCondition | undefined | null): stop is StopCondition {
  return Boolean(stop && ((stop.check ?? '') || stop.idleTimeout));
}

/**
 * Resolve an input slot through a `read_until` wrapper. A wrapper with no child input yet (mid-edit)
 * is left as-is, so it still renders and edits as a plain component.
 */
export function unwrapReadUntil(slot: Record<string, unknown>): UnwrappedInput {
  if (slotComponentKey(slot) !== READ_UNTIL) {
    return { component: slot, innerPath: [] };
  }
  const wrapper = asRecord(slot[READ_UNTIL]);
  const inner = asRecord(wrapper?.input);
  if (!(wrapper && inner && isNonEmptyString(slotComponentKey(inner)))) {
    return { component: slot, innerPath: [] };
  }
  return { component: inner, innerPath: [READ_UNTIL, 'input'], stop: readStopCondition(wrapper) };
}

export const yamlConfig = {
  indent: 2,
  ...YAML_STRINGIFY_OPTIONS,
  minContentWidth: 20,
  doubleQuotedAsJSON: false,
};
