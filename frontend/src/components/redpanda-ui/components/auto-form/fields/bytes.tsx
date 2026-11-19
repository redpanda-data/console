'use client';

import { Textarea } from '../../textarea';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { normalizeScalarInput } from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

function BytesFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <Textarea
      aria-invalid={Boolean(error)}
      disabled={inputProps.disabled}
      id={id}
      onBlur={inputProps.onBlur}
      onChange={(event) => {
        inputProps.onValueChange(event.target.value);
      }}
      placeholder={getFieldUiConfig(field).placeholder ?? 'Base64 payload'}
      resize="vertical"
      testId={testIds.control}
      textStyle="monospace"
      value={normalizeScalarInput(inputProps.value)}
    />
  );
}

export { BytesFieldComponent };
