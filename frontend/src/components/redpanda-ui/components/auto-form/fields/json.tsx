'use client';

import { useFieldTestIds } from './shared';
import { JSONField } from '../../json-field';
import type { AutoFormFieldProps } from '../core-types';
import { getProtoFieldCustomData, getProtoJsonSchema } from '../proto';
import type { FieldTypeDefinition } from '../registry';

function JsonFieldComponent({ field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <JSONField
      maxDepth={3}
      onBlur={inputProps.onBlur}
      onChange={(value) => inputProps.onValueChange(value)}
      schema={getProtoJsonSchema(field) as never}
      showPlaceholder={false}
      testId={testIds.control}
      value={
        ((inputProps.value as unknown) ?? (getProtoFieldCustomData(field)?.jsonKind === 'listValue' ? [] : {})) as never
      }
    />
  );
}

export { JsonFieldComponent };

export const jsonFieldDefinition: FieldTypeDefinition = {
  name: 'json',
  priority: 10,
  match: (field) => field.type === 'json',
  component: JsonFieldComponent,
};
