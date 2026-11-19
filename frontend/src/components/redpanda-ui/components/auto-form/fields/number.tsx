'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Input } from '../../input';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { normalizeNumberValue, resolveNumericStep } from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

function NumberFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const stepValue = resolveNumericStep(inputProps, normalizeNumberValue(inputProps.value));

  return (
    <Input
      aria-invalid={Boolean(error)}
      disabled={inputProps.disabled}
      id={id}
      inputMode="decimal"
      max={inputProps.max}
      min={inputProps.min}
      onBlur={inputProps.onBlur}
      onChange={(event) => {
        const nextValue = event.target.value;
        inputProps.onValueChange(nextValue === '' ? undefined : Number(nextValue));
      }}
      placeholder={getFieldUiConfig(field).placeholder}
      step={stepValue}
      testId={testIds.control}
      type="number"
      value={typeof inputProps.value === 'number' || typeof inputProps.value === 'string' ? inputProps.value : ''}
    />
  );
}

export { NumberFieldComponent };
