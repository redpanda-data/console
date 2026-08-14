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
import { useFieldContext } from '../../field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../../select';
import { useAutoForm } from '../context';
import type { AutoFormFieldProps } from '../core-types';
import { type DataProviderOption, resolveDataProvider } from '../data-providers';
import { UNSET_SELECT_VALUE } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function renderUnsetValue(required: boolean) {
  return required ? null : 'Not set';
}

function renderStaticSelectedValue(value: unknown, options: ReturnType<typeof getFlatOptions>, required: boolean) {
  if (value === UNSET_SELECT_VALUE || value === undefined || value === null || value === '') {
    return renderUnsetValue(required);
  }

  const option = options.find((candidate) => candidate.value === String(value));
  return option ? renderOptionLabel(option) : renderUnsetValue(required);
}

function renderProviderSelectedValue(value: unknown, options: DataProviderOption[], required: boolean) {
  if (value === UNSET_SELECT_VALUE || value === undefined || value === null || value === '') {
    return renderUnsetValue(required);
  }

  const option = options.find((candidate) => candidate.value === String(value));
  return option ? <ProviderOptionLabel option={option} /> : String(value);
}

function SelectFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const { errorId } = useFieldContext();
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
    // Annotated but no implementation registered: warn in dev, fall through to default render.
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
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        aria-label={fieldLabel}
        className={error ? 'border-destructive' : ''}
        disabled={inputProps.disabled}
        id={id}
        testId={testIds.control}
      >
        <SelectValue placeholder="Select an option">
          {(value) => renderStaticSelectedValue(value, flatOptions, field.required)}
        </SelectValue>
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
  const { errorId } = useFieldContext();
  const { options, isLoading, error: providerError } = provider();

  if (providerError) {
    // SelectTrigger/SelectValue need Select.Root context, so wrap the failure
    // state in a disabled <Select> rather than rendering them bare (Radix throws).
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
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        aria-label={fieldLabel}
        className={error ? 'border-destructive' : ''}
        disabled={inputProps.disabled || isLoading}
        id={id}
        testId={testIds.control}
      >
        <SelectValue placeholder={isLoading ? 'Loading…' : 'Select an option'}>
          {(value) => renderProviderSelectedValue(value, options, field.required)}
        </SelectValue>
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
      <span className="text-body-sm text-muted-foreground">{option.description}</span>
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

// Routes any `data_provider`-annotated field to SelectFieldComponent regardless
// of proto type. High priority so the annotation beats string/password/email matchers.
export const dataProviderSelectFieldDefinition: FieldTypeDefinition = {
  name: 'dataProviderSelect',
  priority: 120,
  match: (field) => {
    // Arrays/maps/objects keep their native renderers even when annotated.
    if (field.type !== 'string' && field.type !== 'number') {
      return false;
    }
    return readDataProviderId(field) !== undefined;
  },
  component: SelectFieldComponent,
};
