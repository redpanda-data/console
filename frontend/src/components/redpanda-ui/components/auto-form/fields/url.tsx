'use client';

import { Link2Icon } from 'lucide-react';

import { StringLikeInput, useFieldTestIds } from './shared';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig, URL_FIELD_PATTERN } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function UrlFieldComponent(props: AutoFormFieldProps) {
  const testIds = useFieldTestIds(props.id);

  return (
    <StringLikeInput
      error={props.error}
      icon={<Link2Icon className="h-4 w-4" />}
      id={props.id}
      inputProps={props.inputProps}
      placeholder={getFieldUiConfig(props.field).placeholder || 'https://'}
      testId={testIds.control}
      type="url"
    />
  );
}

export { UrlFieldComponent };

export const urlFieldDefinition: FieldTypeDefinition = {
  name: 'url',
  priority: 20,
  match: (field, context) =>
    field.type === 'string' && (context.inputType === 'url' || URL_FIELD_PATTERN.test(context.identity)),
  component: UrlFieldComponent,
};
