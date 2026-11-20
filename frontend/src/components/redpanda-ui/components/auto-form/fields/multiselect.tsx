'use client';

// Copyright 2026 Redpanda Data, Inc.

import { useFieldContext } from '../../field';
import { SimpleMultiSelect } from '../../multi-select';
import { hasSlotContent } from '../../../lib/has-slot-content';
import { useAutoForm } from '../context';
import type { AutoFormFieldProps } from '../core-types';
import { resolveDataProvider } from '../data-providers';
import { getRenderableText } from '../field-utils';
import { NUMERIC_OPTION_PATTERN } from '../helpers';
import { getFieldUiConfig } from '../ui-config';
import { getGroupedOptions, normalizeScalarInput, readDataProviderId } from './field-values';
import { OptionLabel } from './shared';
import { useFieldTestIds } from './use-field-test-ids';

function MultiSelectFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const { errorId } = useFieldContext();
  const itemField = field.schema?.[0];
  const numericOptions = Boolean(itemField?.options?.every(([value]) => NUMERIC_OPTION_PATTERN.test(value)));
  const optionGroups = itemField === undefined ? undefined : getGroupedOptions(itemField);
  const options =
    optionGroups !== undefined && optionGroups.length > 0
      ? optionGroups.map((group) => ({
          heading: group.label,
          testId: testIds.group(getRenderableText(group.label, 'group')),
          children: group.options.map((option) => ({
            label: <OptionLabel option={option} />,
            selectedTestId: testIds.selected(option.value),
            testId: testIds.option(option.value),
            value: option.value,
          })),
        }))
      : (itemField?.options ?? []).map(([value, optionLabel]) => ({
          label: optionLabel,
          selectedTestId: testIds.selected(value),
          testId: testIds.option(value),
          value,
        }));

  return (
    <SimpleMultiSelect
      aria-describedby={error !== undefined && error !== '' ? errorId : undefined}
      aria-invalid={Boolean(error)}
      disabled={inputProps.disabled}
      id={id}
      onValueChange={(values) => {
        inputProps.onValueChange(numericOptions ? values.map((value) => Number(value)) : values);
      }}
      options={options}
      placeholder={getFieldUiConfig(field).placeholder ?? 'Select one or more options'}
      testId={testIds.field}
      value={Array.isArray(inputProps.value) ? inputProps.value.map(normalizeScalarInput) : []}
      width="full"
    />
  );
}

export { MultiSelectFieldComponent };

// Matches `repeated string` whose item carries a `data_provider` annotation
// (e.g. OpenAPI include_methods/exclude_methods), collapsing per-row dropdowns
// into a single chip-based multi-select.
export function DataProviderMultiSelectComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const { errorId } = useFieldContext();
  const itemField = field.schema?.[0];
  const providerId = readDataProviderId(itemField);
  const { dataProviders } = useAutoForm();
  const provider = resolveDataProvider(dataProviders, providerId);
  const { options: providerOptions = [], isLoading } = provider === undefined ? { options: [] } : provider();

  const options = providerOptions.map((option) => {
    const labelNode = (
      <span className="flex items-center gap-2" key={option.value}>
        {hasSlotContent(option.icon) ? (
          <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-full">{option.icon}</span>
        ) : null}
        <span>{option.label}</span>
        {option.description !== undefined && option.description !== '' ? (
          <span className="text-body-sm text-subtle">— {option.description}</span>
        ) : null}
      </span>
    );
    return {
      label: labelNode,
      selectedTestId: testIds.selected(option.value),
      testId: testIds.option(option.value),
      value: option.value,
    };
  });

  const currentValue = Array.isArray(inputProps.value) ? inputProps.value.map(normalizeScalarInput) : [];

  return (
    <SimpleMultiSelect
      aria-describedby={error !== undefined && error !== '' ? errorId : undefined}
      aria-invalid={Boolean(error)}
      disabled={inputProps.disabled === true || isLoading === true}
      id={id}
      onValueChange={(values) => {
        inputProps.onValueChange(values);
      }}
      options={options}
      placeholder={
        getFieldUiConfig(field).placeholder ?? (isLoading === true ? 'Loading…' : 'Select one or more options')
      }
      testId={testIds.field}
      value={currentValue}
      width="full"
    />
  );
}
