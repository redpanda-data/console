import type { JsonObject, JsonValue } from './json-utils';

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legacy code
/**
 * An explicit default takes precedence. Otherwise the parent schema determines
 * whether the property needs a fallback.
 */
export function generateDefaultFromJsonSchema(
  schema: JsonSchemaType,
  propertyName?: string,
  parentSchema?: JsonSchemaType
) {
  if ('default' in schema && schema.default !== undefined) {
    return schema.default;
  }

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
      const items: JsonValue[] = schema.items ? [generateDefaultFromJsonSchema(schema.items)] : [];
      return items;
    }
    case 'object':
      return generateObjectDefault(schema);
    case 'null':
      return null;
    default:
      return;
  }
}

/**
 * Helper function to check if a property is required in a schema
 * @param propertyName The name of the property to check
 * @param schema The parent schema containing the required array
 * @returns true if the property is required, false otherwise
 */
export function isPropertyRequired(propertyName: string, schema: JsonSchemaType) {
  return schema.required?.includes(propertyName) ?? false;
}

function generateObjectDefault(schema: JsonSchemaType) {
  const result: JsonObject = {};
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (isPropertyRequired(key, schema)) {
      const value = generateDefaultFromJsonSchema(property, key, schema);
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }
  return result;
}
