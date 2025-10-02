export type JSONValue = string | number | boolean | null | undefined | JSONValue[] | { [key: string]: JSONValue };

export type JSONSchemaConst = {
  const: JSONValue;
  title?: string;
  description?: string;
};

export type JSONSchemaType = {
  type?:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'array'
    | 'object'
    | 'null'
    | ('string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null')[];
  title?: string;
  description?: string;
  required?: string[];
  default?: JSONValue;
  examples?: JSONValue[];
  properties?: Record<string, JSONSchemaType>;
  items?: JSONSchemaType;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  enum?: string[];
  const?: JSONValue;
  oneOf?: (JSONSchemaType | JSONSchemaConst)[];
  anyOf?: (JSONSchemaType | JSONSchemaConst)[];
};

export type JSONObject = { [key: string]: JSONValue };

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

/**
 * Determines the specific data type of a JSON value
 * @param value The JSON value to analyze
 * @returns The specific data type including "array" and "null" as distinct types
 */
export function getDataType(value: JSONValue): DataType {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Attempts to parse a string as JSON, only for objects and arrays
 * @param str The string to parse
 * @returns Object with success boolean and either parsed data or original string
 */
export function tryParseJSON(str: string): {
  success: boolean;
  data: JSONValue;
} {
  const trimmed = str.trim();
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}')) && !(trimmed.startsWith('[') && trimmed.endsWith(']'))) {
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
export function updateValueAtPath(obj: JSONValue, path: string[], value: JSONValue): JSONValue {
  if (path.length === 0) return value;

  if (obj === null || obj === undefined) {
    obj = !Number.isNaN(Number(path[0])) ? [] : {};
  }

  if (Array.isArray(obj)) {
    return updateArray(obj, path, value);
  }
  if (typeof obj === 'object' && obj !== null) {
    return updateObject(obj as JSONObject, path, value);
  }
  console.error(`Cannot update path ${path.join('.')} in non-object/array value:`, obj);
  return obj;
}

/**
 * Updates an array at a specific path
 */
function updateArray(array: JSONValue[], path: string[], value: JSONValue): JSONValue[] {
  const [index, ...restPath] = path;
  const arrayIndex = Number(index);

  if (Number.isNaN(arrayIndex)) {
    console.error(`Invalid array index: ${index}`);
    return array;
  }

  if (arrayIndex < 0) {
    console.error(`Array index out of bounds: ${arrayIndex} < 0`);
    return array;
  }

  let newArray: JSONValue[] = [];
  for (let i = 0; i < array.length; i++) {
    newArray[i] = i in array ? array[i] : null;
  }

  if (arrayIndex >= newArray.length) {
    const extendedArray: JSONValue[] = new Array(arrayIndex).fill(null);
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
function updateObject(obj: JSONObject, path: string[], value: JSONValue): JSONObject {
  const [key, ...restPath] = path;

  // Validate object key
  if (typeof key !== 'string') {
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
export function getValueAtPath(obj: JSONValue, path: string[], defaultValue: JSONValue = null): JSONValue {
  if (path.length === 0) return obj;

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
    return getValueAtPath((obj as JSONObject)[first], rest, defaultValue);
  }

  return defaultValue;
}
