'use client';

import {
  type ArrayElementWrapperProps,
  type ArrayWrapperProps,
  type AutoFormFieldProps,
  type AutoFormUIComponents,
  AutoForm as BaseAutoForm,
  buildZodFieldConfig,
  type ExtendableAutoFormProps,
  type FieldWrapperProps,
  type ObjectWrapperProps,
} from '@autoform/react';
import { AlertCircle, PlusIcon, TrashIcon } from 'lucide-react';
import React from 'react';

import { Alert, AlertTitle } from './alert';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export interface AutoFormProps<T extends Record<string, unknown>> extends ExtendableAutoFormProps<T> {}

export const Form = React.forwardRef<HTMLFormElement, React.ComponentProps<'form'>>(({ children, ...props }, ref) => {
  return (
    <form ref={ref} className="space-y-4" {...props}>
      {children}
    </form>
  );
});

export const ArrayElementWrapper: React.FC<ArrayElementWrapperProps> = ({ children, onRemove }) => {
  return (
    <div className="relative border p-4 rounded-md mt-2">
      <Button onClick={onRemove} variant="ghost" size="sm" className="absolute top-2 right-2" type="button">
        <TrashIcon className="h-4 w-4" />
      </Button>
      {children}
    </div>
  );
};

export const ArrayWrapper: React.FC<ArrayWrapperProps> = ({ label, children, onAddItem }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{label}</h3>
      {children}
      <Button onClick={onAddItem} variant="outline" size="sm" type="button">
        <PlusIcon className="h-4 w-4" />
      </Button>
    </div>
  );
};

export const BooleanField: React.FC<AutoFormFieldProps> = ({ field, label, id, inputProps }) => (
  <div className="flex items-center space-x-2">
    <Checkbox
      id={id}
      onCheckedChange={(checked) => {
        const event = {
          target: {
            name: field.key,
            value: checked,
          },
        };
        inputProps.onChange(event);
      }}
      checked={inputProps.value}
    />
    <Label htmlFor={id}>
      {label}
      {field.required && <span className="text-destructive"> *</span>}
    </Label>
  </div>
);

export const DateField: React.FC<AutoFormFieldProps> = ({ inputProps, error, id }) => {
  // biome-ignore lint/correctness/noUnusedVariables: part of auto form date field implementation
  const { key, ...props } = inputProps;

  return <Input id={id} type="date" className={error ? 'border-destructive' : ''} {...props} />;
};

export const ErrorMessage: React.FC<{ error: string }> = ({ error }) => (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>{error}</AlertTitle>
  </Alert>
);

const DISABLED_LABELS = ['boolean', 'object', 'array'];

export const FieldWrapper: React.FC<FieldWrapperProps> = ({ label, children, id, field, error }) => {
  const isDisabled = DISABLED_LABELS.includes(field.type);

  return (
    <div className="space-y-2">
      {!isDisabled && (
        <Label htmlFor={id}>
          {label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      {children}
      {field.fieldConfig?.description && (
        <p className="text-sm text-muted-foreground">{field.fieldConfig.description}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

export const NumberField: React.FC<AutoFormFieldProps> = ({ inputProps, error, id }) => {
  // biome-ignore lint/correctness/noUnusedVariables: part of auto form number field implementation
  const { key, ...props } = inputProps;

  return <Input id={id} type="number" className={error ? 'border-destructive' : ''} {...props} />;
};

export const ObjectWrapper: React.FC<ObjectWrapperProps> = ({ label, children }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{label}</h3>
      {children}
    </div>
  );
};

export const SelectField: React.FC<AutoFormFieldProps> = ({ field, inputProps, error, id }) => {
  // biome-ignore lint/correctness/noUnusedVariables: part of auto form select field implementation
  const { key, ...props } = inputProps;

  return (
    <Select
      {...props}
      onValueChange={(value) => {
        const syntheticEvent = {
          target: {
            value,
            name: field.key,
          },
        } as React.ChangeEvent<HTMLInputElement>;
        props.onChange(syntheticEvent);
      }}
      defaultValue={field.default}
    >
      <SelectTrigger id={id} className={error ? 'border-destructive' : ''}>
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        {(field.options || []).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const StringField: React.FC<AutoFormFieldProps> = ({ inputProps, error, id }) => {
  // biome-ignore lint/correctness/noUnusedVariables: part of auto form string field implementation
  const { key, ...props } = inputProps;

  return <Input id={id} className={error ? 'border-destructive' : ''} {...props} />;
};

export const SubmitButton: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Button type="submit">{children}</Button>
);

const ShadcnUIComponents: AutoFormUIComponents = {
  Form,
  FieldWrapper,
  ErrorMessage,
  SubmitButton,
  ObjectWrapper,
  ArrayWrapper,
  ArrayElementWrapper,
};

export const ShadcnAutoFormFieldComponents = {
  string: StringField,
  number: NumberField,
  boolean: BooleanField,
  date: DateField,
  select: SelectField,
} as const;
export type FieldTypes = keyof typeof ShadcnAutoFormFieldComponents;

export const fieldConfig = buildZodFieldConfig<
  FieldTypes,
  // biome-ignore lint/complexity/noBannedTypes: part of auto-form implementation
  {
    // Add types for `customData` here.
  }
>();

export function AutoForm<T extends Record<string, unknown>>({
  uiComponents,
  formComponents,
  ...props
}: AutoFormProps<T>) {
  return (
    <BaseAutoForm
      {...props}
      uiComponents={{ ...ShadcnUIComponents, ...uiComponents }}
      formComponents={{ ...ShadcnAutoFormFieldComponents, ...formComponents }}
    />
  );
}
