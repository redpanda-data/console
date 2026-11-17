'use client';

import { useFieldTestIds } from './shared';
import { Input } from '../../input';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function DurationFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <Input
      aria-invalid={Boolean(error)}
      className={error ? 'border-destructive font-mono' : 'font-mono'}
      disabled={inputProps.disabled}
      id={id}
      onBlur={inputProps.onBlur}
      onChange={(event) => inputProps.onValueChange(event.target.value)}
      placeholder={getFieldUiConfig(field).placeholder || '300s'}
      testId={testIds.control}
      value={(inputProps.value as string | undefined) ?? ''}
    />
  );
}

export { DurationFieldComponent };

export const durationFieldDefinition: FieldTypeDefinition = {
  name: 'duration',
  priority: 10,
  match: (field) => field.type === 'duration',
  component: DurationFieldComponent,
};
