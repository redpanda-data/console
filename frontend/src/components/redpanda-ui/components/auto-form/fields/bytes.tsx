'use client';

import { useFieldTestIds } from './shared';
import { Textarea } from '../../textarea';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function BytesFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <Textarea
      aria-invalid={Boolean(error)}
      className={error ? 'border-destructive font-mono' : 'font-mono'}
      disabled={inputProps.disabled}
      id={id}
      onBlur={inputProps.onBlur}
      onChange={(event) => inputProps.onValueChange(event.target.value)}
      placeholder={getFieldUiConfig(field).placeholder || 'Base64 payload'}
      resize="vertical"
      testId={testIds.control}
      value={(inputProps.value as string | undefined) ?? ''}
    />
  );
}

export { BytesFieldComponent };

export const bytesFieldDefinition: FieldTypeDefinition = {
  name: 'bytes',
  priority: 10,
  match: (field) => field.type === 'bytes',
  component: BytesFieldComponent,
};
