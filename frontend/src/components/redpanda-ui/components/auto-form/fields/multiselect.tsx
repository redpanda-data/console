'use client';

import { getGroupedOptions, readDataProviderId, renderOptionLabel, useFieldTestIds } from './shared';
import { SimpleMultiSelect } from '../../multi-select';
import { useAutoForm } from '../context';
import type { AutoFormFieldProps } from '../core-types';
import { resolveDataProvider } from '../data-providers';
import { getFieldUiConfig, NUMERIC_OPTION_PATTERN } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function MultiSelectFieldComponent({ field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const itemField = field.schema?.[0];
  const numericOptions = Boolean(itemField?.options?.every(([value]) => NUMERIC_OPTION_PATTERN.test(value)));
  const optionGroups = itemField ? getGroupedOptions(itemField) : undefined;
  const options = optionGroups?.length
    ? optionGroups.map((group) => ({
        heading: group.label,
        testId: testIds.group(String(group.label ?? 'group')),
        children: group.options.map((option) => ({
          label: renderOptionLabel(option),
          selectedTestId: testIds.selected(option.value),
          testId: testIds.option(option.value),
          value: option.value,
        })),
      }))
    : (itemField?.options || []).map(([value, optionLabel]) => ({
        label: optionLabel,
        selectedTestId: testIds.selected(value),
        testId: testIds.option(value),
        value,
      }));

  return (
    <SimpleMultiSelect
      disabled={inputProps.disabled}
      id={id}
      onValueChange={(values) =>
        inputProps.onValueChange(numericOptions ? values.map((value) => Number(value)) : values)
      }
      options={options}
      placeholder={getFieldUiConfig(field).placeholder || 'Select one or more options'}
      testId={testIds.field}
      value={Array.isArray(inputProps.value) ? inputProps.value.map((value: unknown) => String(value)) : []}
      width="full"
    />
  );
}

export { MultiSelectFieldComponent };

export const multiselectFieldDefinition: FieldTypeDefinition = {
  name: 'multiselect',
  priority: 20,
  match: (field) => {
    if (field.type !== 'array') {
      return false;
    }
    const itemField = field.schema?.[0];
    return Boolean(itemField?.type === 'select' && itemField.options?.length);
  },
  component: MultiSelectFieldComponent,
};

// ── Data-provider-backed multi-select ─────────────────────────────────
// Matches `repeated string` whose item carries a `data_provider`
// annotation, e.g. OpenAPI `include_methods` / `exclude_methods`. The
// previous behavior rendered a list of single dropdowns with an "Add"
// button — one row per method. A multi-select collapses that to a single
// control that holds every picked method as a chip.

function DataProviderMultiSelectComponent({ field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const itemField = field.schema?.[0];
  const providerId = readDataProviderId(itemField);
  const { dataProviders } = useAutoForm();
  const provider = resolveDataProvider(dataProviders, providerId);
  const { options: providerOptions = [], isLoading } = provider ? provider() : { options: [] };

  const options = providerOptions.map((option) => {
    // `label` is typed as ReactNode on MultiSelectOptionItem, so we can
    // render icon + text + description inline instead of stringifying.
    const labelNode = (
      <span className="flex items-center gap-2">
        {option.icon ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full">
            {option.icon}
          </span>
        ) : null}
        <span>{option.label}</span>
        {option.description ? <span className="text-muted-foreground text-xs">— {option.description}</span> : null}
      </span>
    );
    return {
      label: labelNode,
      selectedTestId: testIds.selected(option.value),
      testId: testIds.option(option.value),
      value: option.value,
    };
  });

  const currentValue = Array.isArray(inputProps.value) ? inputProps.value.map((value: unknown) => String(value)) : [];

  return (
    <SimpleMultiSelect
      disabled={inputProps.disabled || isLoading}
      id={id}
      onValueChange={(values) => inputProps.onValueChange(values)}
      options={options}
      placeholder={getFieldUiConfig(field).placeholder || (isLoading ? 'Loading…' : 'Select one or more options')}
      testId={testIds.field}
      value={currentValue}
      width="full"
    />
  );
}

export const dataProviderMultiselectFieldDefinition: FieldTypeDefinition = {
  name: 'dataProviderMultiSelect',
  // Higher than the default `multiselect` (20) so an annotated item wins
  // over the legacy "array-of-select-enum" branch even when both match.
  priority: 120,
  match: (field) => {
    if (field.type !== 'array') {
      return false;
    }
    const itemField = field.schema?.[0];
    if (!itemField || (itemField.type !== 'string' && itemField.type !== 'number')) {
      return false;
    }
    return readDataProviderId(itemField) !== undefined;
  },
  component: DataProviderMultiSelectComponent,
};
