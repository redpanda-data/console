'use client';

import { Input } from '../../input';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { normalizeScalarInput } from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

function DurationFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <Input
      aria-invalid={Boolean(error)}
      disabled={inputProps.disabled}
      id={id}
      onBlur={inputProps.onBlur}
      onChange={(event) => {
        inputProps.onValueChange(event.target.value);
      }}
      placeholder={getFieldUiConfig(field).placeholder ?? '300s'}
      testId={testIds.control}
      textStyle="monospace"
      value={normalizeScalarInput(inputProps.value)}
    />
  );
}

export { DurationFieldComponent };
