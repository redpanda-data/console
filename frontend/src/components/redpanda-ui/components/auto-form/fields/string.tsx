'use client';

import { StringLikeInput, useFieldTestIds } from './shared';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function StringFieldComponent(props: AutoFormFieldProps) {
  const testIds = useFieldTestIds(props.id);

  return (
    <StringLikeInput
      error={props.error}
      id={props.id}
      inputProps={props.inputProps}
      placeholder={getFieldUiConfig(props.field).placeholder}
      testId={testIds.control}
    />
  );
}

export { StringFieldComponent };

export const stringFieldDefinition: FieldTypeDefinition = {
  name: 'string',
  priority: 10,
  match: (field) => field.type === 'string',
  component: StringFieldComponent,
};
