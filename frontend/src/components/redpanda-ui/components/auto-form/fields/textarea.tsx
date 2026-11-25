'use client';

import { useFieldTestIds } from './shared';
import { Textarea } from '../../textarea';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig, LONG_TEXT_FIELD_PATTERN } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function TextareaFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <Textarea
      aria-invalid={Boolean(error)}
      className={error ? 'border-destructive' : ''}
      disabled={inputProps.disabled}
      id={id}
      onBlur={inputProps.onBlur}
      onChange={(event) => inputProps.onValueChange(event.target.value)}
      placeholder={getFieldUiConfig(field).placeholder}
      resize="vertical"
      testId={testIds.control}
      value={(inputProps.value as string | undefined) ?? ''}
    />
  );
}

export { TextareaFieldComponent };

export const textareaFieldDefinition: FieldTypeDefinition = {
  name: 'textarea',
  priority: 15,
  match: (field, context) =>
    field.type === 'string' &&
    (context.inputType === 'textarea' || context.maxLength > 120 || LONG_TEXT_FIELD_PATTERN.test(context.identity)),
  component: TextareaFieldComponent,
};
