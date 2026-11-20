'use client';

import { useState } from 'react';
import { Combobox, type ComboboxOption } from '../combobox';
import { Input } from '../input';
import { requireDefined } from '../../lib/utils/require-defined';
import { jsonControlId } from './control-id';
import type { JSONFormFieldProps, JSONOptionStore } from './json-form-types';
import type { CustomFieldConfig, JSONSchemaType } from './json-value';

/** The JSONField owns choices, so changing editor modes cannot discard them. */
export function useJSONOptions(): JSONOptionStore {
  const [byKey, setByKey] = useState<ReadonlyMap<string, ComboboxOption[]>>(new Map());
  const create = (key: string, value: string) => {
    setByKey((previous) => {
      const options = previous.get(key) ?? [];
      if (options.some((option) => option.value === value)) {
        return previous;
      }
      return new Map(previous).set(key, [...options, { value, label: value }]);
    });
  };
  return { byKey, create };
}

function jsonControlProps({ settings, path, propertyName, schema }: JSONFormFieldProps) {
  const name = propertyName ?? schema.title;
  const fallback = path.length > 0 ? `Item ${Number(path.at(-1)) + 1}` : 'Value';
  return {
    id: jsonControlId(settings.fieldId, path),
    'aria-label': name !== undefined && name !== '' ? name : fallback,
  };
}

export function TypeMismatch({ type, path }: { type: string; path: string[] }) {
  const location = path.join('.');
  return (
    <p className="text-body-sm text-destructive" role="alert">
      Expected {type} value for {location === '' ? 'root' : location}. Switch to JSON to correct it.
    </p>
  );
}

function stringChoices(choices: JSONSchemaType['oneOf']): ComboboxOption[] | undefined {
  if (choices === undefined) {
    return;
  }
  const options: ComboboxOption[] = [];
  for (const choice of choices) {
    if (typeof choice.const !== 'string' || typeof choice.title !== 'string') {
      return;
    }
    options.push({ value: choice.const, label: choice.title });
  }
  return options;
}

function fieldRequired({ parentSchema, propertyName }: JSONFormFieldProps): boolean {
  return parentSchema?.required?.includes(propertyName ?? '') ?? false;
}

function StringOptions({
  field,
  customField,
  options,
  value,
}: {
  field: JSONFormFieldProps;
  customField: CustomFieldConfig | undefined;
  options: ComboboxOption[];
  value: string;
}) {
  const { path, settings } = field;
  const optionKey = customField === undefined ? field.optionKey : `custom/${encodeURIComponent(customField.fieldName)}`;
  const createdOptions = settings.options.byKey.get(optionKey) ?? [];
  const knownValues = new Set(options.map((option) => option.value));
  const availableOptions = [...options, ...createdOptions.filter((option) => !knownValues.has(option.value))];
  const placeholder = customField?.placeholder;
  return (
    <Combobox
      {...jsonControlProps(field)}
      creatable
      onChange={(nextValue) => {
        if (
          customField?.onCreateOption !== undefined &&
          nextValue !== '' &&
          availableOptions.every((option) => option.value !== nextValue)
        ) {
          return;
        }
        settings.onError(undefined);
        settings.onFieldChange(path, nextValue !== '' || fieldRequired(field) ? nextValue : undefined);
      }}
      onCreateOption={(newValue) => {
        settings.onError(undefined);
        if (customField?.onCreateOption === undefined) {
          settings.options.create(optionKey, newValue);
          settings.onFieldChange(path, newValue);
        } else {
          const reportFailure = (error: unknown) => {
            settings.onError(error instanceof Error ? error.message : 'Could not create the option.');
          };
          try {
            customField
              .onCreateOption(newValue, path, (changedPath, changedValue) => {
                settings.onFieldChange(changedPath, changedValue);
              })
              .catch(reportFailure);
          } catch (error) {
            reportFailure(error);
          }
        }
      }}
      options={availableOptions}
      placeholder={placeholder === undefined || placeholder === '' ? 'Select an option...' : placeholder}
      value={value}
    />
  );
}

function stringInputType(format: string | undefined) {
  switch (format) {
    case 'email':
      return 'email';
    case 'uri':
      return 'url';
    case 'date':
      return 'date';
    case 'date-time':
      return 'datetime-local';
    case undefined:
      return 'text';
    default:
      return 'text';
  }
}

export function JSONStringField(field: JSONFormFieldProps) {
  const { schema, value, path, propertyName, settings } = field;
  if (value !== null && value !== undefined && typeof value !== 'string') {
    return <TypeMismatch path={path} type="string" />;
  }
  const customField = settings.customFields.find((candidate) => candidate.fieldName === propertyName);
  const options =
    customField?.options ??
    stringChoices(schema.oneOf) ??
    schema.enum?.map((option) => ({ value: option, label: option }));
  if (options !== undefined) {
    const soleOption =
      customField?.options.length === 1
        ? requireDefined(customField.options[0], 'Expected the sole custom option.')
        : undefined;
    const effectiveValue =
      soleOption !== undefined && (value === undefined || value === null || value === '') ? soleOption.value : value;
    return <StringOptions customField={customField} field={field} options={options} value={effectiveValue ?? ''} />;
  }
  return (
    <Input
      {...jsonControlProps(field)}
      maxLength={schema.maxLength}
      minLength={schema.minLength}
      onChange={(event) => {
        settings.onFieldChange(path, event.target.value);
      }}
      pattern={schema.pattern}
      placeholder={schema.description}
      required={fieldRequired(field)}
      type={stringInputType(schema.format)}
      value={value ?? ''}
    />
  );
}

export function JSONNumberField(field: JSONFormFieldProps & { integer?: boolean }) {
  const { schema, value, path, settings, integer = false } = field;
  if (value !== null && value !== undefined && typeof value !== 'number') {
    return <TypeMismatch path={path} type={integer ? 'integer' : 'number'} />;
  }
  const required = fieldRequired(field);
  return (
    <Input
      {...jsonControlProps(field)}
      max={schema.maximum}
      min={schema.minimum}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (nextValue === '' && !required) {
          settings.onFieldChange(path, undefined);
          return;
        }
        const number = Number(nextValue);
        if (!Number.isNaN(number) && (!integer || Number.isInteger(number))) {
          settings.onFieldChange(path, number);
        }
      }}
      placeholder={schema.description}
      required={required}
      step={integer ? '1' : undefined}
      type="number"
      value={value?.toString() ?? ''}
    />
  );
}

export function JSONBooleanField(field: JSONFormFieldProps) {
  const { value, path, settings } = field;
  if (value !== null && value !== undefined && typeof value !== 'boolean') {
    return <TypeMismatch path={path} type="boolean" />;
  }
  return (
    <Input
      {...jsonControlProps(field)}
      checked={value ?? false}
      className="size-4"
      onChange={(event) => {
        settings.onFieldChange(path, event.target.checked);
      }}
      required={fieldRequired(field)}
      type="checkbox"
    />
  );
}
