'use client';

import { Combobox } from '../../combobox';
import type { AutoFormFieldProps } from '../core-types';
import { getRenderableText } from '../field-utils';
import { getFieldUiConfig } from '../ui-config';
import { getFlatOptions, getGroupedOptions, hasNumericOptions, normalizeScalarInput } from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

function ComboboxFieldComponent({ field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const numericOptions = hasNumericOptions(field);
  const optionGroups = getGroupedOptions(field);
  const options =
    optionGroups !== undefined && optionGroups.length > 0
      ? optionGroups.flatMap((group) =>
          group.options.map((option) => ({
            group: getRenderableText(group.label),
            groupTestId: testIds.group(getRenderableText(group.label, option.value)),
            testId: testIds.option(option.value),
            value: option.value,
            label: [getRenderableText(group.label), getRenderableText(option.label, option.value)]
              .filter(Boolean)
              .join(' · '),
          }))
        )
      : getFlatOptions(field).map((option) => ({
          value: option.value,
          label: getRenderableText(option.label, option.value),
          testId: testIds.option(option.value),
        }));

  return (
    <Combobox
      disabled={inputProps.disabled}
      id={id}
      inputTestId={testIds.control}
      onChange={(value) => {
        inputProps.onValueChange(numericOptions ? Number(value) : value);
      }}
      options={options}
      placeholder={getFieldUiConfig(field).placeholder ?? 'Search options'}
      value={normalizeScalarInput(inputProps.value)}
    />
  );
}

export { ComboboxFieldComponent };
