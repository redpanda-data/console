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

export type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

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
export function toJson(obj: unknown, space?: string | number | undefined): string {
  seen.clear();
  try {
    return JSON.stringify(
      obj,
      (_key: string, value: unknown) => {
        if (typeof value === 'object' && value !== null) {
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
// Clone object using serialization

export function clone<T>(obj: T): T {
  if (!obj) {
    return obj;
  }
  return JSON.parse(toJson(obj));
}
// Accesses all members of an object by serializing it

export function touch(obj: unknown): void {
  JSON.stringify(obj, (_k, v) => {
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
  data: JsonValue;
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

  let mutableObj = obj;
  if (obj === null || obj === undefined) {
    mutableObj = Number.isNaN(Number(path[0])) ? {} : [];
  }

  if (Array.isArray(mutableObj)) {
    return updateArray(mutableObj, path, value);
  }
  if (typeof mutableObj === 'object' && mutableObj !== null) {
    return updateObject(mutableObj as JsonObject, path, value);
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

  if (Number.isNaN(arrayIndex)) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`Invalid array index: ${index}`);
    return array;
  }

  if (arrayIndex < 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`Array index out of bounds: ${arrayIndex} < 0`);
    return array;
  }

  let newArray: JsonValue[] = [];
  for (let i = 0; i < array.length; i++) {
    newArray[i] = i in array ? array[i] : null;
  }

  if (arrayIndex >= newArray.length) {
    const extendedArray: JsonValue[] = new Array(arrayIndex).fill(null);
    // Copy over the existing elements (now guaranteed to be dense)
    for (let i = 0; i < newArray.length; i++) {
      extendedArray[i] = newArray[i];
    }
    newArray = extendedArray;
  }

  if (restPath.length === 0) {
    newArray[arrayIndex] = value;
  } else {
    newArray[arrayIndex] = updateValueAtPath(newArray[arrayIndex], restPath, value);
  }
  return newArray;
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
    // Ensure key exists
    if (!(key in newObj)) {
      newObj[key] = {};
    }
    newObj[key] = updateValueAtPath(newObj[key], restPath, value);
  }
  return newObj;
}

/**
 * Gets a value at a specific path in a nested JSON structure
 * @param obj The JSON value to traverse
 * @param path Array of keys/indices representing the path to the value
 * @param defaultValue Value to return if path doesn't exist
 * @returns The value at the path, or defaultValue if not found
 */
export function getValueAtPath(obj: JsonValue, path: string[], defaultValue: JsonValue = null): JsonValue {
  if (path.length === 0) {
    return obj;
  }

  const [first, ...rest] = path;

  if (obj === null || obj === undefined) {
    return defaultValue;
  }

  if (Array.isArray(obj)) {
    const index = Number(first);
    if (Number.isNaN(index) || index < 0 || index >= obj.length) {
      return defaultValue;
    }
    return getValueAtPath(obj[index], rest, defaultValue);
  }

  if (typeof obj === 'object' && obj !== null) {
    if (!(first in obj)) {
      return defaultValue;
    }
    return getValueAtPath((obj as JsonObject)[first], rest, defaultValue);
  }

  return defaultValue;
}

/**
 * Recursively parses JSON strings within objects and arrays
 * Attempts to parse string values as JSON, replacing them with parsed values if successful
 * Falls back to original string if parsing fails
 *
 * @param value The value to deep parse (can be any type)
 * @param depth Current recursion depth (internal, used to prevent infinite loops)
 * @param maxDepth Maximum recursion depth (default: 10)
 * @returns The value with nested JSON strings parsed
 *
 * @example
 * // Input: { text: '{"city":"Singapore","temp":28}' }
 * // Output: { text: { city: "Singapore", temp: 28 } }
 *
 * @example
 * // Input: [{ type: "text", text: '{"data":"value"}' }]
 * // Output: [{ type: "text", text: { data: "value" } }]
 */
export function deepParseJson(value: unknown, depth = 0, maxDepth = 10): unknown {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return value;
  }

  // Handle null and undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle arrays - recursively parse each element
  if (Array.isArray(value)) {
    return value.map((item) => deepParseJson(item, depth + 1, maxDepth));
  }

  // Handle objects - recursively parse each property
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepParseJson(val, depth + 1, maxDepth);
    }
    return result;
  }

  // Handle strings - attempt to parse as JSON
  if (typeof value === 'string') {
    const parseResult = tryParseJson(value);
    if (parseResult.success) {
      // Recursively parse the parsed result (in case it contains nested JSON strings)
      return deepParseJson(parseResult.data, depth + 1, maxDepth);
    }
    // If parsing fails, return original string
    return value;
  }

  // For all other types (number, boolean, etc.), return as-is
  return value;
}
