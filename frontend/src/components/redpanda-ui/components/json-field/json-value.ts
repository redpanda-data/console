// Copyright 2026 Redpanda Data, Inc.

import { z } from 'zod';

export interface CustomFieldConfig {
  fieldName: string;
  onCreateOption?: (
    newValue: string,
    path: string[],
    handleFieldChange: (path: string[], value: JSONValue) => void
  ) => Promise<void>;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export type JSONValue = string | number | boolean | null | undefined | JSONValue[] | { [key: string]: JSONValue };

export interface JSONSchemaConst {
  const: JSONValue;
  description?: string;
  title?: string;
}

export interface JSONSchemaType {
  anyOf?: (JSONSchemaType | JSONSchemaConst)[];
  const?: JSONValue;
  default?: JSONValue;
  description?: string;
  enum?: string[];
  examples?: JSONValue[];
  format?: string;
  items?: JSONSchemaType;
  maximum?: number;
  maxLength?: number;
  minimum?: number;
  minLength?: number;
  oneOf?: (JSONSchemaType | JSONSchemaConst)[];
  pattern?: string;
  properties?: Record<string, JSONSchemaType>;
  required?: string[];
  title?: string;
  type?:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'array'
    | 'object'
    | 'null'
    | ('string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null')[];
}

const jsonValueSchema = z.json();

/** Validate a controlled document without replacing its caller-owned identity. */
export function isJSONValue(value: unknown): value is JSONValue {
  return jsonValueSchema.safeParse(value).success;
}

/** Decode untrusted editor input before allowing it into typed form state. */
export function parseJSONValue(source: string): JSONValue {
  return validateJSONValue(JSON.parse(source));
}

/** Validate already-parsed data without lossy JSON.stringify coercions. */
export function validateJSONValue(value: unknown): JSONValue {
  const result = jsonValueSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError(`Invalid JSON value: ${result.error.message}`);
  }
  return result.data;
}

export interface JSONObject {
  [key: string]: JSONValue;
}

export function updateValueAtPath(obj: JSONValue, path: string[], value: JSONValue): JSONValue {
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
    return updateObject(mutableObj, path, value);
  }
  return mutableObj;
}

function updateArray(array: JSONValue[], path: string[], value: JSONValue): JSONValue[] {
  const [index, ...restPath] = path;
  const arrayIndex = Number(index);

  if (Number.isNaN(arrayIndex)) {
    return array;
  }

  if (arrayIndex < 0) {
    return array;
  }

  let newArray: JSONValue[] = [];
  for (let i = 0; i < array.length; i++) {
    newArray[i] = i in array ? array[i] : null;
  }

  if (arrayIndex >= newArray.length) {
    const extendedArray: JSONValue[] = Array.from({ length: arrayIndex }, () => null);
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

function updateObject(obj: JSONObject, path: string[], value: JSONValue): JSONObject {
  const [key, ...restPath] = path;

  if (typeof key !== 'string') {
    return obj;
  }

  const newObj = { ...obj };

  if (restPath.length === 0) {
    newObj[key] = value;
  } else {
    if (!(key in newObj)) {
      newObj[key] = {};
    }
    newObj[key] = updateValueAtPath(newObj[key], restPath, value);
  }
  return newObj;
}
