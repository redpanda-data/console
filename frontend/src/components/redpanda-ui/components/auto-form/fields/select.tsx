'use client';

import { useFieldContext } from '../../field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../select';
import { hasSlotContent } from '../../../lib/has-slot-content';
import { useAutoForm } from '../context';
import type { AutoFormFieldProps } from '../core-types';
import { type DataProviderOption, resolveDataProvider } from '../data-providers';
import { getRenderableText } from '../field-utils';
import { UNSET_SELECT_VALUE } from '../helpers';
import {
  getControlLabel,
  getFlatOptions,
  getGroupedOptions,
  hasNumericOptions,
  normalizeScalarInput,
  readDataProviderId,
} from './field-values';
import { OptionLabel } from './shared';
import { useFieldTestIds } from './use-field-test-ids';

function renderUnsetValue(required: boolean) {
  return required ? null : 'Not set';
}

function renderStaticSelectedValue(value: unknown, options: ReturnType<typeof getFlatOptions>, required: boolean) {
  if (value === UNSET_SELECT_VALUE || value === undefined || value === null || value === '') {
    return renderUnsetValue(required);
  }

  const option = options.find((candidate) => candidate.value === normalizeScalarInput(value));
  return option === undefined ? renderUnsetValue(required) : <OptionLabel option={option} />;
}

function renderProviderSelectedValue(value: unknown, options: DataProviderOption[], required: boolean) {
  if (value === UNSET_SELECT_VALUE || value === undefined || value === null || value === '') {
    return renderUnsetValue(required);
  }

  const option = options.find((candidate) => candidate.value === normalizeScalarInput(value));
  return option === undefined ? normalizeScalarInput(value) : <ProviderOptionLabel option={option} />;
}

function SelectFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const { errorId } = useFieldContext();
  const { dataProviders } = useAutoForm();
  const providerId = readDataProviderId(field);
  const provider = resolveDataProvider(dataProviders, providerId);
  const numericOptions = hasNumericOptions(field);
  const currentValue =
    inputProps.value === undefined || inputProps.value === null
      ? UNSET_SELECT_VALUE
      : normalizeScalarInput(inputProps.value);
  const fieldLabel = getControlLabel(label, field);
  const optionGroups = getGroupedOptions(field);
  const flatOptions = getFlatOptions(field);

  if (provider !== undefined) {
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
        aria-describedby={error !== undefined && error !== '' ? errorId : undefined}
        aria-invalid={Boolean(error)}
        aria-label={fieldLabel}
        disabled={inputProps.disabled}
        id={id}
        testId={testIds.control}
      >
        <SelectValue placeholder="Select an option">
          {(value) => renderStaticSelectedValue(value, flatOptions, field.required)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {field.required ? null : (
          <SelectItem testId={testIds.option('not-set')} value={UNSET_SELECT_VALUE}>
            Not set
          </SelectItem>
        )}
        {optionGroups !== undefined && optionGroups.length > 0
          ? optionGroups.map((group) => (
              <SelectGroup
                key={JSON.stringify(group.options.map((option) => option.value))}
                testId={testIds.group(getRenderableText(group.label, 'options'))}
              >
                {hasSlotContent(group.label) ? <SelectLabel>{group.label}</SelectLabel> : null}
                {group.options.map((option) => (
                  <SelectItem key={option.value} testId={testIds.option(option.value)} value={option.value}>
                    <OptionLabel option={option} />
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          : flatOptions.map((option) => (
              <SelectItem key={option.value} testId={testIds.option(option.value)} value={option.value}>
                <OptionLabel option={option} />
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
  provider: () => { options: DataProviderOption[]; isLoading?: boolean | undefined; error?: unknown };
  testIds: ReturnType<typeof useFieldTestIds>;
}) {
  const { errorId } = useFieldContext();
  const { options, isLoading, error: providerError } = provider();

  if (providerError !== undefined && providerError !== null) {
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
    acc[key] = acc[key] === undefined ? [option] : [...acc[key], option];
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
        aria-describedby={error !== undefined && error !== '' ? errorId : undefined}
        aria-invalid={Boolean(error)}
        aria-label={fieldLabel}
        disabled={inputProps.disabled === true || isLoading === true}
        id={id}
        testId={testIds.control}
      >
        <SelectValue placeholder={isLoading === true ? 'Loading…' : 'Select an option'}>
          {(value) => renderProviderSelectedValue(value, options, field.required)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {field.required ? null : (
          <SelectItem testId={testIds.option('not-set')} value={UNSET_SELECT_VALUE}>
            Not set
          </SelectItem>
        )}
        {options.length === 0 && isLoading !== true ? (
          <SelectItem disabled testId={testIds.option('empty')} value="__empty">
            No options available
          </SelectItem>
        ) : null}
        {hasGroups
          ? Object.entries(grouped).map(([groupLabel, groupOptions]) => (
              <SelectGroup key={groupLabel} testId={testIds.group(groupLabel === '' ? 'ungrouped' : groupLabel)}>
                {groupLabel === '' ? null : <SelectLabel>{groupLabel}</SelectLabel>}
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
  const labelWithIcon = hasSlotContent(option.icon) ? (
    <span className="flex items-center gap-2">
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-full">{option.icon}</span>
      <span>{option.label}</span>
    </span>
  ) : (
    <span>{option.label}</span>
  );

  if (option.description === undefined || option.description === '') {
    return labelWithIcon;
  }
  return (
    <span className="flex items-center justify-between gap-3">
      {labelWithIcon}
      <span className="text-body-sm text-subtle">{option.description}</span>
    </span>
  );
}

export { SelectFieldComponent };
