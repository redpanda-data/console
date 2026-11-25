'use client';

import { Input } from '../../input';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { normalizeScalarInput } from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

function Int64FieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <Input
      aria-invalid={Boolean(error)}
      disabled={inputProps.disabled}
      id={id}
      inputMode="numeric"
      onBlur={inputProps.onBlur}
      onChange={(event) => {
        inputProps.onValueChange(event.target.value);
      }}
      placeholder={getFieldUiConfig(field).placeholder}
      testId={testIds.control}
      textStyle="monospace"
      value={normalizeScalarInput(inputProps.value)}
    />
  );
}

export { Int64FieldComponent };
