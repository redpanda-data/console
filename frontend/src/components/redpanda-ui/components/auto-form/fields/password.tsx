'use client';

import { StringLikeInput, useFieldTestIds } from './shared';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig, SECRET_FIELD_PATTERN } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function PasswordFieldComponent(props: AutoFormFieldProps) {
  const testIds = useFieldTestIds(props.id);

  return (
    <StringLikeInput
      error={props.error}
      id={props.id}
      inputProps={props.inputProps}
      placeholder={getFieldUiConfig(props.field).placeholder}
      testId={testIds.control}
      type="password"
    />
  );
}

export { PasswordFieldComponent };

export const passwordFieldDefinition: FieldTypeDefinition = {
  name: 'password',
  priority: 20,
  match: (field, context) =>
    field.type === 'string' && (SECRET_FIELD_PATTERN.test(context.identity) || context.inputType === 'password'),
  component: PasswordFieldComponent,
};
