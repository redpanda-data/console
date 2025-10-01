import type { JsonValue } from 'utils/jsonUtils';

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
};
