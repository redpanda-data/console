'use client';

import {
  getControlLabel,
  getFlatOptions,
  getGroupedOptions,
  hasNumericOptions,
  readDataProviderId,
  renderOptionLabel,
  useFieldTestIds,
} from './shared';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../../select';
import { useAutoForm } from '../context';
import type { AutoFormFieldProps } from '../core-types';
import { type DataProviderOption, resolveDataProvider } from '../data-providers';
import { UNSET_SELECT_VALUE } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function SelectFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const { dataProviders } = useAutoForm();
  const providerId = readDataProviderId(field);
  const provider = resolveDataProvider(dataProviders, providerId);
  const numericOptions = hasNumericOptions(field);
  const currentValue =
    inputProps.value === undefined || inputProps.value === null ? UNSET_SELECT_VALUE : String(inputProps.value);
  const fieldLabel = getControlLabel(label, field);
  const optionGroups = getGroupedOptions(field);
  const flatOptions = getFlatOptions(field);

  if (provider) {
    return (
      <SelectFieldFromProvider
        currentValue={currentValue}
        error={error}
        field={field}
        fieldLabel={fieldLabel}
        id={id}
        inputProps={inputProps}
        provider={provider}
        testIds={testIds}
      />
    );
  }

  if (providerId) {
    // Annotated but no implementation registered — loud dev warning, graceful fallback.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[AutoForm] Field "${field.key}" is annotated with data_provider="${providerId}" ` +
          'but no provider is registered. Check the AutoForm dataProviders map.'
      );
    }
  }

  return (
    <Select
      onValueChange={(value) => {
        if (value === UNSET_SELECT_VALUE) {
          inputProps.onValueChange(undefined);
          return;
        }
        inputProps.onValueChange(numericOptions ? Number(value) : value);
      }}
      value={currentValue}
    >
      <SelectTrigger
        aria-label={fieldLabel}
        className={error ? 'border-destructive' : ''}
        disabled={inputProps.disabled}
        id={id}
        testId={testIds.control}
      >
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        {field.required ? null : (
          <SelectItem testId={testIds.option('not-set')} value={UNSET_SELECT_VALUE}>
            Not set
          </SelectItem>
        )}
        {optionGroups?.length
          ? optionGroups.map((group, groupIndex) => (
              <SelectGroup
                key={`${field.key}-group-${groupIndex}`}
                testId={testIds.group(String(group.label ?? groupIndex))}
              >
                {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
                {group.options.map((option) => (
                  <SelectItem key={option.value} testId={testIds.option(option.value)} value={option.value}>
                    {renderOptionLabel(option)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          : flatOptions.map((option) => (
              <SelectItem key={option.value} testId={testIds.option(option.value)} value={option.value}>
                {renderOptionLabel(option)}
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  );
}

function SelectFieldFromProvider({
  currentValue,
  error,
  field,
  fieldLabel,
  id,
  inputProps,
  provider,
  testIds,
}: {
  currentValue: string;
  error: AutoFormFieldProps['error'];
  field: AutoFormFieldProps['field'];
  fieldLabel: string;
  id: string;
  inputProps: AutoFormFieldProps['inputProps'];
  provider: () => { options: DataProviderOption[]; isLoading?: boolean; error?: unknown };
  testIds: ReturnType<typeof useFieldTestIds>;
}) {
  const { options, isLoading, error: providerError } = provider();

  if (providerError) {
    // `SelectTrigger` / `SelectValue` are Radix primitives that need a
    // `Select.Root` context. Wrap them in a disabled `<Select>` so the
    // failure state still renders as a coherent select-shaped control
    // rather than throwing a Radix context error.
    return (
      <Select disabled value="">
        <SelectTrigger aria-label={fieldLabel} disabled id={id} testId={testIds.control}>
          <SelectValue placeholder="Failed to load options" />
        </SelectTrigger>
      </Select>
    );
  }

  const grouped = options.reduce<Record<string, DataProviderOption[]>>((acc, option) => {
    const key = option.group ?? '';
    acc[key] = acc[key] ? [...acc[key], option] : [option];
    return acc;
  }, {});
  const hasGroups = Object.keys(grouped).some((k) => k !== '');

  return (
    <Select
      onValueChange={(value) => {
        if (value === UNSET_SELECT_VALUE) {
          inputProps.onValueChange(undefined);
          return;
        }
        inputProps.onValueChange(value);
      }}
      value={currentValue}
    >
      <SelectTrigger
        aria-label={fieldLabel}
        className={error ? 'border-destructive' : ''}
        disabled={inputProps.disabled || isLoading}
        id={id}
        testId={testIds.control}
      >
        <SelectValue placeholder={isLoading ? 'Loading…' : 'Select an option'} />
      </SelectTrigger>
      <SelectContent>
        {field.required ? null : (
          <SelectItem testId={testIds.option('not-set')} value={UNSET_SELECT_VALUE}>
            Not set
          </SelectItem>
        )}
        {options.length === 0 && !isLoading ? (
          <SelectItem disabled testId={testIds.option('empty')} value="__empty">
            No options available
          </SelectItem>
        ) : null}
        {hasGroups
          ? Object.entries(grouped).map(([groupLabel, groupOptions]) => (
              <SelectGroup key={groupLabel || 'ungrouped'} testId={testIds.group(groupLabel || 'ungrouped')}>
                {groupLabel ? <SelectLabel>{groupLabel}</SelectLabel> : null}
                {groupOptions.map((option) => (
                  <SelectItem key={option.value} testId={testIds.option(option.value)} value={option.value}>
                    <ProviderOptionLabel option={option} />
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          : options.map((option) => (
              <SelectItem key={option.value} testId={testIds.option(option.value)} value={option.value}>
                <ProviderOptionLabel option={option} />
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  );
}

function ProviderOptionLabel({ option }: { option: DataProviderOption }) {
  const labelWithIcon = option.icon ? (
    <span className="flex items-center gap-2">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full">
        {option.icon}
      </span>
      <span>{option.label}</span>
    </span>
  ) : (
    <span>{option.label}</span>
  );

  if (!option.description) {
    return labelWithIcon;
  }
  return (
    <span className="flex items-center justify-between gap-3">
      {labelWithIcon}
      <span className="text-muted-foreground text-xs">{option.description}</span>
    </span>
  );
}

export { SelectFieldComponent };

export const selectFieldDefinition: FieldTypeDefinition = {
  name: 'select',
  priority: 12,
  match: (field) => {
    if (field.type !== 'select') {
      return false;
    }
    const optionCount = field.options?.length ?? 0;
    return optionCount > 3 && optionCount <= 8;
  },
  component: SelectFieldComponent,
};

/**
 * Second routing rule for the same `SelectFieldComponent`. Matches any
 * field annotated with `data_provider`, regardless of its underlying
 * proto type — a string field with `data_provider = AWS_REGIONS`
 * becomes a select populated from the hosting app's data-provider
 * registry. High priority so the annotation wins over the default
 * `string` / `password` / `email` matchers.
 *
 * The same component handles both rules; the routing split exists only
 * because static proto-enum selects and annotation-driven selects
 * match under different conditions.
 */
export const dataProviderSelectFieldDefinition: FieldTypeDefinition = {
  name: 'dataProviderSelect',
  priority: 120,
  match: (field) => {
    // Arrays / maps / objects keep their native renderers even when the
    // parent field is annotated with a data provider. Support for
    // array-of-strings multi-select from a data provider is a follow-up.
    if (field.type !== 'string' && field.type !== 'number') {
      return false;
    }
    return readDataProviderId(field) !== undefined;
  },
  component: SelectFieldComponent,
};
