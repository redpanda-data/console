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

import { isObject } from './type-guards';

export type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = Record<string, JsonValue>;

export type DataType =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'symbol'
  | 'undefined'
  | 'object'
  | 'function'
  | 'array'
  | 'null';

const seen = new Set();
// Serialize object to json, handling reference loops gracefully
export function toJson(obj: unknown, space?: string | number): string {
  seen.clear();
  try {
    return JSON.stringify(
      obj,
      (_key: string, value: unknown) => {
        if (isObject(value)) {
          if (seen.has(value)) {
            return;
          }
          seen.add(value);
        }

        if (value instanceof Error) {
          return value.toString();
        }

        return value;
      },
      space
    );
  } finally {
    seen.clear();
  }
}
// Accesses all members of an object by serializing it

export function touch(obj: unknown): void {
  JSON.stringify(obj, (_k: string, v: unknown) => {
    if (typeof v === 'object') {
      return v;
    }
    return '';
  });
}

/**
 * Determines the specific data type of a JSON value
 * @param value The JSON value to analyze
 * @returns The specific data type including "array" and "null" as distinct types
 */
export function getDataType(value: JsonValue): DataType {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

/**
 * Attempts to parse a string as JSON, only for objects and arrays
 * @param str The string to parse
 * @returns Object with success boolean and either parsed data or original string
 */
export function tryParseJson(str: string): {
  success: boolean;
  data: unknown;
} {
  const trimmed = str.trim();
  if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
    return { success: false, data: str };
  }
  try {
    return { success: true, data: JSON.parse(str) };
  } catch {
    return { success: false, data: str };
  }
}

/**
 * Updates a value at a specific path in a nested JSON structure
 * @param obj The original JSON value
 * @param path Array of keys/indices representing the path to the value
 * @param value The new value to set
 * @returns A new JSON value with the updated path
 */
export function updateValueAtPath(obj: JsonValue, path: string[], value: JsonValue): JsonValue {
  if (path.length === 0) {
    return value;
  }

  const mutableObj = obj ?? (Number.isNaN(Number(path[0])) ? {} : []);

  if (Array.isArray(mutableObj)) {
    return updateArray(mutableObj, path, value);
  }
  if (isObject(mutableObj)) {
    return updateObject(mutableObj, path, value);
  }
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.error(`Cannot update path ${path.join('.')} in non-object/array value:`, mutableObj);
  return mutableObj;
}

/**
 * Updates an array at a specific path
 */
function updateArray(array: JsonValue[], path: string[], value: JsonValue): JsonValue[] {
  const [index, ...restPath] = path;
  const arrayIndex = Number(index);

  if (Number.isNaN(arrayIndex) || arrayIndex < 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(
      Number.isNaN(arrayIndex) ? `Invalid array index: ${index}` : `Array index out of bounds: ${arrayIndex} < 0`
    );
    return array;
  }

  const newArray = copyDenseArray(array, Math.max(array.length, arrayIndex));
  newArray[arrayIndex] = restPath.length === 0 ? value : updateValueAtPath(newArray[arrayIndex], restPath, value);
  return newArray;
}

function copyDenseArray(array: JsonValue[], length: number): JsonValue[] {
  /* oxlint-disable unicorn/no-new-array -- Array.from truncates fractional lengths instead of preserving RangeError. */
  // biome-ignore lint/nursery/noNewArray: preserve RangeError for invalid array lengths, unlike Array.from.
  const copy = new Array<JsonValue>(length).fill(null);
  /* oxlint-enable unicorn/no-new-array */
  for (let index = 0; index < array.length; index++) {
    copy[index] = index in array ? array[index] : null;
  }
  return copy;
}

/**
 * Updates an object at a specific path
 */
function updateObject(obj: JsonObject, path: string[], value: JsonValue): JsonObject {
  const [key, ...restPath] = path;

  // Validate object key
  if (typeof key !== 'string') {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`Invalid object key: ${key}`);
    return obj;
  }

  const newObj = { ...obj };

  if (restPath.length === 0) {
    newObj[key] = value;
  } else {
    newObj[key] = updateValueAtPath(key in newObj ? newObj[key] : {}, restPath, value);
  }
  return newObj;
}
// Missing paths and present undefined leaves have different public results.
const MISSING_PATH_VALUE = Symbol('missing-json-path');

function valueAtKey(value: JsonValue, key: string): JsonValue | typeof MISSING_PATH_VALUE {
  if (Array.isArray(value)) {
    const index = Number(key);
    return Number.isNaN(index) || index < 0 || index >= value.length ? MISSING_PATH_VALUE : value[index];
  }
  return value !== null && typeof value === 'object' && key in value ? value[key] : MISSING_PATH_VALUE;
}

/**
 * Gets a value at a specific path in a nested JSON structure
 * @param obj The JSON value to traverse
 * @param path Array of keys/indices representing the path to the value
 * @param defaultValue Value to return if path doesn't exist
 * @returns The value at the path, or defaultValue if not found
 */
export function getValueAtPath(obj: JsonValue, path: string[], defaultValue: JsonValue = null): JsonValue {
  let current = obj;
  // The recursive implementation snapshots the remaining keys before reading any property getters.
  const keys = path.slice();
  for (const key of keys) {
    const next = valueAtKey(current, key);
    if (next === MISSING_PATH_VALUE) {
      return defaultValue;
    }
    current = next;
  }
  return current;
}

/**
 * Walks objects and arrays replacing any string that parses as JSON with the parsed value; strings
 * that don't parse are left alone. `depth`/`maxDepth` bound the recursion.
 */
export function deepParseJson(value: unknown, depth = 0, maxDepth = 10): unknown {
  // Prevent infinite recursion
  if (depth > maxDepth || value === null || value === undefined) {
    return value;
  }

  // Handle arrays - recursively parse each element
  if (Array.isArray(value)) {
    return value.map((item) => deepParseJson(item, depth + 1, maxDepth));
  }

  // Handle objects - recursively parse each property
  if (typeof value === 'object') {
    return deepParseObject(value, depth, maxDepth);
  }

  // Handle strings - attempt to parse as JSON
  if (typeof value === 'string') {
    const parseResult = tryParseJson(value);
    return parseResult.success ? deepParseJson(parseResult.data, depth + 1, maxDepth) : value;
  }

  // For all other types (number, boolean, etc.), return as-is
  return value;
}

function deepParseObject(value: object, depth: number, maxDepth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = deepParseJson(val, depth + 1, maxDepth);
  }
  return result;
}
