'use client';

import { normalizeNumberValue, resolveNumericStep, useFieldTestIds } from './shared';
import { Input } from '../../input';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function NumberFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const stepValue = resolveNumericStep(inputProps, normalizeNumberValue(inputProps.value));

  return (
    <Input
      aria-invalid={Boolean(error)}
      className={error ? 'border-destructive' : ''}
      disabled={inputProps.disabled}
      id={id}
      inputMode="decimal"
      max={inputProps.max as number | undefined}
      min={inputProps.min as number | undefined}
      onBlur={inputProps.onBlur}
      onChange={(event) => {
        const nextValue = event.target.value;
        inputProps.onValueChange(nextValue === '' ? undefined : Number(nextValue));
      }}
      placeholder={getFieldUiConfig(field).placeholder}
      step={stepValue}
      testId={testIds.control}
      type="number"
      value={inputProps.value ?? ''}
    />
  );
}

export { NumberFieldComponent };

export const numberFieldDefinition: FieldTypeDefinition = {
  name: 'number',
  priority: 10,
  match: (field) => {
    if (field.type !== 'number') {
      return false;
    }
    const min = Number(field.fieldConfig?.inputProps?.min);
    const max = Number(field.fieldConfig?.inputProps?.max);
    return !(Number.isFinite(min) && Number.isFinite(max));
  },
  component: NumberFieldComponent,
};
