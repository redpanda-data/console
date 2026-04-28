'use client';

import { MailIcon } from 'lucide-react';

import { StringLikeInput, useFieldTestIds } from './shared';
import type { AutoFormFieldProps } from '../core-types';
import { EMAIL_FIELD_PATTERN, getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function EmailFieldComponent(props: AutoFormFieldProps) {
  const testIds = useFieldTestIds(props.id);

  return (
    <StringLikeInput
      error={props.error}
      icon={<MailIcon className="h-4 w-4" />}
      id={props.id}
      inputProps={props.inputProps}
      placeholder={getFieldUiConfig(props.field).placeholder}
      testId={testIds.control}
      type="email"
    />
  );
}

export { EmailFieldComponent };

export const emailFieldDefinition: FieldTypeDefinition = {
  name: 'email',
  priority: 20,
  match: (field, context) =>
    field.type === 'string' && (context.inputType === 'email' || EMAIL_FIELD_PATTERN.test(context.identity)),
  component: EmailFieldComponent,
};
