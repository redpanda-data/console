'use client';

import { getFlatOptions, getGroupedOptions, hasNumericOptions, useFieldTestIds } from './shared';
import { Combobox } from '../../combobox';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function ComboboxFieldComponent({ field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const numericOptions = hasNumericOptions(field);
  const optionGroups = getGroupedOptions(field);
  const options = optionGroups?.length
    ? optionGroups.flatMap((group) =>
        group.options.map((option) => ({
          group: String(group.label ?? ''),
          groupTestId: testIds.group(String(group.label ?? option.value)),
          testId: testIds.option(option.value),
          value: option.value,
          label: `${group.label ? `${group.label} · ` : ''}${String(option.label ?? option.value)}`,
        }))
      )
    : getFlatOptions(field).map((option) => ({
        value: option.value,
        label: String(option.label ?? option.value),
        testId: testIds.option(option.value),
      }));

  return (
    <Combobox
      disabled={inputProps.disabled}
      inputTestId={testIds.control}
      onChange={(value) => inputProps.onValueChange(numericOptions ? Number(value) : value)}
      options={options}
      placeholder={getFieldUiConfig(field).placeholder || 'Search options'}
      value={inputProps.value === undefined || inputProps.value === null ? '' : String(inputProps.value)}
    />
  );
}

export { ComboboxFieldComponent };

export const comboboxFieldDefinition: FieldTypeDefinition = {
  name: 'combobox',
  priority: 18,
  match: (field) => {
    if (field.type !== 'select') {
      return false;
    }
    const optionCount = field.options?.length ?? 0;
    return optionCount > 8;
  },
  component: ComboboxFieldComponent,
};
