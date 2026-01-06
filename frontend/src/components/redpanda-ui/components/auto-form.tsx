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
import { Heading, Text } from './typography';

export interface AutoFormProps<T extends Record<string, unknown>> extends ExtendableAutoFormProps<T> {}

export const Form = React.forwardRef<HTMLFormElement, React.ComponentProps<'form'>>(({ children, ...props }, ref) => (
  <form className="space-y-4" ref={ref} {...props}>
    {children}
  </form>
));

export const ArrayElementWrapper: React.FC<ArrayElementWrapperProps> = ({ children, onRemove }) => (
  <div className="relative mt-2 rounded-md border p-4">
    <Button className="absolute top-2 right-2" onClick={onRemove} size="sm" type="button" variant="ghost">
      <TrashIcon className="h-4 w-4" />
    </Button>
    {children}
  </div>
);

export const ArrayWrapper: React.FC<ArrayWrapperProps> = ({ label, children, onAddItem }) => (
  <div className="space-y-4">
    <Heading className="font-medium" level={3}>
      {label}
    </Heading>
    {children}
    <Button onClick={onAddItem} size="sm" type="button" variant="outline">
      <PlusIcon className="h-4 w-4" />
    </Button>
  </div>
);

export const BooleanField: React.FC<AutoFormFieldProps> = ({ field, label, id, inputProps }) => (
  <div className="flex items-center space-x-2">
    <Checkbox
      checked={inputProps.value}
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
    />
    <Label htmlFor={id}>
      <Text as="span" className="flex flex-row items-center gap-1">
        {label}
        {field.required ? (
          <Text as="span" className="text-destructive">
            *
          </Text>
        ) : null}
      </Text>
    </Label>
  </div>
);

export const DateField: React.FC<AutoFormFieldProps> = ({ inputProps, error, id }) => {
  const { key, ...props } = inputProps;

  return <Input className={error ? 'border-destructive' : ''} id={id} type="date" {...props} />;
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
          <Text as="span" className="flex flex-row items-center gap-1">
            {label}
            {field.required ? (
              <Text as="span" className="text-destructive">
                *
              </Text>
            ) : null}
          </Text>
        </Label>
      )}
      {children}
      {field.fieldConfig?.description ? (
        <Text className="text-muted-foreground" variant="small">
          {field.fieldConfig.description}
        </Text>
      ) : null}
      {error ? (
        <Text className="text-destructive" variant="small">
          {error}
        </Text>
      ) : null}
    </div>
  );
};

export const NumberField: React.FC<AutoFormFieldProps> = ({ inputProps, error, id }) => {
  const { key, ...props } = inputProps;

  return <Input className={error ? 'border-destructive' : ''} id={id} type="number" {...props} />;
};

export const ObjectWrapper: React.FC<ObjectWrapperProps> = ({ label, children }) => (
  <div className="space-y-4">
    <Heading className="font-medium" level={3}>
      {label}
    </Heading>
    {children}
  </div>
);

export const SelectField: React.FC<AutoFormFieldProps> = ({ field, inputProps, error, id }) => {
  const { key, ...props } = inputProps;

  return (
    <Select
      {...props}
      defaultValue={field.default}
      onValueChange={(value) => {
        const syntheticEvent = {
          target: {
            value,
            name: field.key,
          },
        } as React.ChangeEvent<HTMLInputElement>;
        props.onChange(syntheticEvent);
      }}
    >
      <SelectTrigger className={error ? 'border-destructive' : ''} id={id}>
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        {(field.options || []).map(([optionKey, label]) => (
          <SelectItem key={optionKey} value={optionKey}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const StringField: React.FC<AutoFormFieldProps> = ({ inputProps, error, id }) => {
  const { key, ...props } = inputProps;

  return <Input className={error ? 'border-destructive' : ''} id={id} {...props} />;
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
      formComponents={{ ...ShadcnAutoFormFieldComponents, ...formComponents }}
      uiComponents={{ ...ShadcnUIComponents, ...uiComponents }}
    />
  );
}
