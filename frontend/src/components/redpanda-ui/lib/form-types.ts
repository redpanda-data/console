/**
 * Schema-agnostic form contract types.
 *
 * These types define the boundary between schema providers (e.g. protobuf-provider)
 * and form renderers (e.g. AutoForm). They live in @/lib so that libraries can
 * implement them without depending on component-level code.
 */

import type { ComponentType, ReactNode } from 'react';

export type Renderable = ReactNode;

export interface FieldConfig<FieldTypes = string, CustomData = Record<string, unknown>> {
  customData?: CustomData;
  description?: Renderable;
  fieldType?: FieldTypes;
  fieldWrapper?: ComponentType<Record<string, unknown>>;
  inputProps?: Record<string, unknown>;
  label?: Renderable;
  order?: number;
}

export interface ParsedField<FieldTypes = string> {
  default?: unknown;
  description?: Renderable;
  fieldConfig?: FieldConfig<FieldTypes>;
  key: string;
  options?: [string, string][];
  required: boolean;
  schema?: ParsedField<FieldTypes>[];
  type: string;
}

export interface ParsedSchema<FieldTypes = string> {
  fields: ParsedField<FieldTypes>[];
}

export interface SchemaValidationError {
  message: string;
  path: (string | number)[];
}

export type SchemaValidation<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: SchemaValidationError[] };

export interface SchemaProvider<T = Record<string, unknown>> {
  getDefaultValues(): Record<string, unknown>;
  parseSchema(): ParsedSchema;
  validateSchema: (values: Record<string, unknown>) => SchemaValidation<T>;
}
