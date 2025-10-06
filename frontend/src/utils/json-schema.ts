/**
 * Shared JSON Schema utilities for generating defaults and working with schemas
 * Used by both remote-mcp and rp-connect features
 */

import type { JsonObject, JsonValue } from './jsonUtils';

export type JsonSchemaConst = {
  const: JsonValue;
  title?: string;
  description?: string;
};

export type JsonSchemaType = {
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
  default?: JsonValue;
  examples?: JsonValue[];
  properties?: Record<string, JsonSchemaType>;
  items?: JsonSchemaType;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  enum?: string[];
  const?: JsonValue;
  oneOf?: (JsonSchemaType | JsonSchemaConst)[];
  anyOf?: (JsonSchemaType | JsonSchemaConst)[];
  patternProperties?: Record<string, JsonSchemaType>;
  additionalProperties?: boolean | JsonSchemaType;
  $ref?: string;
};

/**
 * Generates a default value based on a JSON schema type
 * Moved from remote-mcp/schema-utils.tsx to be shared across features
 *
 * @param schema The JSON schema definition
 * @param propertyName Optional property name for checking if it's required in parent schema
 * @param parentSchema Optional parent schema to check required array
 * @returns A default value matching the schema type
 */
export function generateDefaultFromJsonSchema(
  schema: JsonSchemaType,
  propertyName?: string,
  parentSchema?: JsonSchemaType
): JsonValue {
  if ('default' in schema && schema.default !== undefined) {
    return schema.default;
  }

  // Check if this property is required in the parent schema
  const isRequired = propertyName && parentSchema ? isPropertyRequired(propertyName, parentSchema) : false;

  switch (schema.type) {
    case 'string':
      return isRequired ? '' : undefined;
    case 'number':
    case 'integer':
      return isRequired ? 0 : undefined;
    case 'boolean':
      return isRequired ? false : undefined;
    case 'array': {
      // Always start arrays with at least 1 item to reduce user clicks
      if (!schema.items) return [];
      const defaultItem = generateDefaultFromJsonSchema(schema.items);
      return [defaultItem];
    }
    case 'object': {
      if (!schema.properties) return {};

      const obj: JsonObject = {};
      // Only include properties that are required according to the schema's required array
      Object.entries(schema.properties).forEach(([key, prop]) => {
        if (isPropertyRequired(key, schema)) {
          const value = generateDefaultFromJsonSchema(prop, key, schema);
          if (value !== undefined) {
            obj[key] = value;
          }
        }
      });
      return obj;
    }
    case 'null':
      return null;
    default:
      return undefined;
  }
}

/**
 * Helper function to check if a property is required in a schema
 * @param propertyName The name of the property to check
 * @param schema The parent schema containing the required array
 * @returns true if the property is required, false otherwise
 */
export function isPropertyRequired(propertyName: string, schema: JsonSchemaType): boolean {
  return schema.required?.includes(propertyName) ?? false;
}
