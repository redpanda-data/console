'use client';

import { Textarea } from '../../textarea';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { normalizeScalarInput } from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

function TextareaFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
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
      placeholder={getFieldUiConfig(field).placeholder}
      resize="vertical"
      testId={testIds.control}
      value={normalizeScalarInput(inputProps.value)}
    />
  );
}

export { TextareaFieldComponent };
