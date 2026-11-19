'use client';

import { useFieldContext } from '../../field';
import { ToggleGroup, ToggleGroupItem } from '../../toggle-group';
import type { AutoFormFieldProps } from '../core-types';
import { getControlLabel, getFlatOptions, hasNumericOptions, normalizeScalarInput } from './field-values';
import { OptionLabel } from './shared';
import { useFieldTestIds } from './use-field-test-ids';

function ToggleGroupFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const { errorId } = useFieldContext();
  const numericOptions = hasNumericOptions(field);
  const value = normalizeScalarInput(inputProps.value);
  const options = getFlatOptions(field);

  return (
    <ToggleGroup
      aria-describedby={error !== undefined && error !== '' ? errorId : undefined}
      aria-invalid={Boolean(error)}
      aria-label={getControlLabel(label, field)}
      // Multi-select not supported yet — use multiselect field type instead
      onValueChange={(nextValue) => {
        const next = nextValue[0] ?? '';
        inputProps.onValueChange(numericOptions ? Number(next) : next);
      }}
      testId={testIds.control}
      value={value === '' ? [] : [value]}
      variant="outline"
    >
      {options.map((option) => (
        <ToggleGroupItem
          disabled={inputProps.disabled}
          key={option.value}
          testId={testIds.option(option.value)}
          value={option.value}
        >
          <OptionLabel option={option} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export { ToggleGroupFieldComponent };
