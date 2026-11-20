// Copyright 2026 Redpanda Data, Inc.

import type React from 'react';
import type { ReactNode } from 'react';
import type { ParsedField, Renderable } from '../../lib/form-types';

// Re-exported from the shared lib so consumers can keep importing from here.
export type {
  FieldConfig,
  ParsedField,
  ParsedSchema,
  Renderable,
  SchemaProvider,
  SchemaValidation,
  SchemaValidationError,
} from '../../lib/form-types';

export interface FieldWrapperProps {
  children: ReactNode;
  error?: Renderable | undefined;
  field: ParsedField;
  id: string;
  label: Renderable;
}

export interface ObjectWrapperProps {
  children: ReactNode;
  field: ParsedField;
  hasError?: boolean | undefined;
  label: Renderable;
}

export interface ArrayWrapperProps {
  children: ReactNode;
  field: ParsedField;
  label: Renderable;
  onAddItem: () => void;
}

export interface ArrayElementWrapperProps {
  children: ReactNode;
  index: number;
  onRemove: () => void;
}

export interface AutoFormUIComponents {
  ArrayElementWrapper: React.ComponentType<ArrayElementWrapperProps>;
  ArrayWrapper: React.ComponentType<ArrayWrapperProps>;
  ErrorMessage: React.ComponentType<{ error: string }>;
  FieldWrapper: React.ComponentType<FieldWrapperProps>;
  Form: React.ComponentType<React.ComponentProps<'form'>>;
  ObjectWrapper: React.ComponentType<ObjectWrapperProps>;
  SubmitButton: React.ComponentType<{ children: ReactNode; testId?: string | undefined }>;
}

export type AutoFormValue = boolean | number | object | string | null | undefined;
type AutoFormValueChangeHandler = {
  bivarianceHack(value: AutoFormValue): void;
}['bivarianceHack'];

export interface AutoFormInputProps {
  disabled?: boolean | undefined;
  max?: number | string | undefined;
  maxLength?: number | undefined;
  min?: number | string | undefined;
  name?: string | undefined;
  onBlur: () => void;
  onValueChange: AutoFormValueChangeHandler;
  pattern?: string | undefined;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  step?: number | string | undefined;
  testId?: string | undefined;
  type?: string | undefined;
  value?: AutoFormValue | undefined;
  [key: string]: unknown;
}

export interface AutoFormFieldProps {
  error?: string | undefined;
  field: ParsedField;
  id: string;
  inputProps: AutoFormInputProps;
  label: Renderable;
  path: string[];
  value: AutoFormValue;
}

export interface AutoFormFieldComponents {
  [key: string]: React.ComponentType<AutoFormFieldProps>;
}
