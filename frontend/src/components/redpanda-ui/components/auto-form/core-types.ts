import type React from 'react';
import type { ReactNode } from 'react';

// Re-export schema contract types from shared lib so existing consumers
// can continue importing from './core-types' without changes.
export type {
  FieldConfig,
  ParsedField,
  ParsedSchema,
  Renderable,
  SchemaProvider,
  SchemaValidation,
  SchemaValidationError,
} from '../../lib/form-types';

import type { ParsedField, Renderable } from '../../lib/form-types';

// ---------------------------------------------------------------------------
// UI component contracts — AutoForm-specific wrapper and field props.
// ---------------------------------------------------------------------------

export type FieldWrapperProps = {
  label: Renderable;
  error?: Renderable;
  children: ReactNode;
  id: string;
  field: ParsedField;
};

export type ObjectWrapperProps = {
  label: Renderable;
  children: ReactNode;
  field: ParsedField;
  hasError?: boolean;
};

export type ArrayWrapperProps = {
  label: Renderable;
  children: ReactNode;
  field: ParsedField;
  onAddItem: () => void;
};

export type ArrayElementWrapperProps = {
  children: ReactNode;
  onRemove: () => void;
  index: number;
};

export type AutoFormUIComponents = {
  Form: React.ComponentType<React.ComponentProps<'form'>>;
  FieldWrapper: React.ComponentType<FieldWrapperProps>;
  ErrorMessage: React.ComponentType<{ error: string }>;
  SubmitButton: React.ComponentType<{ children: ReactNode }>;
  ObjectWrapper: React.ComponentType<ObjectWrapperProps>;
  ArrayWrapper: React.ComponentType<ArrayWrapperProps>;
  ArrayElementWrapper: React.ComponentType<ArrayElementWrapperProps>;
};

export type AutoFormFieldProps = {
  label: Renderable;
  field: ParsedField;
  value: any;
  error?: string;
  id: string;
  path: string[];
  inputProps: Record<string, any>;
};

export type AutoFormFieldComponents = {
  [key: string]: React.ComponentType<AutoFormFieldProps>;
};
