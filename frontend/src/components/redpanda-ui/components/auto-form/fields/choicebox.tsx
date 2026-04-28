'use client';

import { getControlLabel, getFlatOptions, hasNumericOptions, renderOptionLabel, useFieldTestIds } from './shared';
import {
  Choicebox,
  ChoiceboxItem,
  ChoiceboxItemContent,
  ChoiceboxItemHeader,
  ChoiceboxItemIndicator,
  ChoiceboxItemTitle,
} from '../../choicebox';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function ChoiceboxFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const numericOptions = hasNumericOptions(field);
  const value = inputProps.value === undefined || inputProps.value === null ? '' : String(inputProps.value);
  const options = getFlatOptions(field);

  return (
    <Choicebox
      aria-invalid={Boolean(error)}
      aria-label={getControlLabel(label, field)}
      onValueChange={(nextValue) => inputProps.onValueChange(numericOptions ? Number(nextValue) : nextValue)}
      testId={testIds.control}
      value={value}
    >
      {options.map((option) => (
        <ChoiceboxItem
          disabled={inputProps.disabled}
          key={option.value}
          testId={testIds.option(option.value)}
          value={option.value}
        >
          <ChoiceboxItemHeader>
            <ChoiceboxItemTitle>{renderOptionLabel(option)}</ChoiceboxItemTitle>
          </ChoiceboxItemHeader>
          <ChoiceboxItemContent>
            <ChoiceboxItemIndicator />
          </ChoiceboxItemContent>
        </ChoiceboxItem>
      ))}
    </Choicebox>
  );
}

export { ChoiceboxFieldComponent };

export const choiceboxFieldDefinition: FieldTypeDefinition = {
  name: 'choicebox',
  priority: 25,
  match: (field) => {
    if (field.type !== 'select') {
      return false;
    }
    return getFieldUiConfig(field).control === 'choicebox';
  },
  component: ChoiceboxFieldComponent,
};
