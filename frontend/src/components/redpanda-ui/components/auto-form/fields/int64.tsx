'use client';

import { useFieldTestIds } from './shared';
import { Input } from '../../input';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function Int64FieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <Input
      aria-invalid={Boolean(error)}
      className={error ? 'border-destructive font-mono' : 'font-mono'}
      disabled={inputProps.disabled}
      id={id}
      inputMode="numeric"
      onBlur={inputProps.onBlur}
      onChange={(event) => inputProps.onValueChange(event.target.value)}
      placeholder={getFieldUiConfig(field).placeholder}
      testId={testIds.control}
      value={(inputProps.value as string | undefined) ?? ''}
    />
  );
}

export { Int64FieldComponent };

export const int64FieldDefinition: FieldTypeDefinition = {
  name: 'int64',
  priority: 10,
  match: (field) => field.type === 'int64',
  component: Int64FieldComponent,
};
