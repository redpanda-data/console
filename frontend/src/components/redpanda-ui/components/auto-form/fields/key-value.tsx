'use client';

import { useFieldTestIds } from './shared';
import { KeyValueField } from '../../key-value-field';
import type { AutoFormFieldProps } from '../core-types';
import {
  denormalizeKeyValueEntries,
  getFieldUiConfig,
  normalizeKeyValueEntries,
  resolveRenderFieldType,
} from '../helpers';
import { getProtoFieldCustomData } from '../proto';
import type { FieldTypeDefinition } from '../registry';

function KeyValueFieldComponent({ field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const valueField =
    field.type === 'map'
      ? field.schema?.[1]
      : field.schema?.[0]?.schema?.find((candidate) => candidate.key === 'value');
  const valueRenderType = valueField ? resolveRenderFieldType(valueField) : undefined;
  const protoData = getProtoFieldCustomData(field);

  const valueFieldProps =
    valueRenderType === 'select' || valueRenderType === 'combobox' || valueRenderType === 'radio'
      ? {
          mode: 'combobox' as const,
          options: (valueField?.options || []).map(([value, optionLabel]) => ({ value, label: optionLabel })),
          placeholder: getFieldUiConfig(valueField ?? field).placeholder || 'Value',
        }
      : {
          placeholder: getFieldUiConfig(valueField ?? field).placeholder || 'Value',
        };

  return (
    <KeyValueField
      addButtonLabel="Add pair"
      disabled={inputProps.disabled}
      keyFieldProps={{ placeholder: 'Key' }}
      maxItems={protoData?.maxPairs}
      onChange={(entries) => inputProps.onValueChange(denormalizeKeyValueEntries(entries, field))}
      showAddButton
      testId={testIds.control}
      value={normalizeKeyValueEntries(inputProps.value)}
      valueFieldProps={valueFieldProps}
    />
  );
}

export { KeyValueFieldComponent };

/**
 * Helper to check if a field's schema entry is a scalar type suitable for key-value use.
 */
function isKeyValueScalarField(field: { type?: string } | undefined): boolean {
  if (!field) {
    return false;
  }
  return ['string', 'email', 'url', 'password', 'currency', 'number', 'int64', 'select', 'combobox'].includes(
    field.type ?? ''
  );
}

function isSimpleKeyValueLikeObject(
  field: { type?: string; schema?: Array<{ key: string; type?: string }> } | undefined
): boolean {
  if (!(field?.type === 'object' && field.schema?.length === 2)) {
    return false;
  }

  const keyField = field.schema.find((candidate) => candidate.key === 'key');
  const valueField = field.schema.find((candidate) => candidate.key === 'value');
  return Boolean(keyField && valueField && isKeyValueScalarField(keyField) && isKeyValueScalarField(valueField));
}

export const keyValueFieldDefinition: FieldTypeDefinition = {
  name: 'keyValue',
  priority: 18,
  match: (field) => {
    // Array with key-value-like object items
    if (field.type === 'array') {
      const itemField = field.schema?.[0];
      return isSimpleKeyValueLikeObject(itemField);
    }

    // Map with scalar key + value
    if (field.type === 'map') {
      const keyField = field.schema?.[0];
      const valueField = field.schema?.[1];
      return isKeyValueScalarField(keyField) && isKeyValueScalarField(valueField);
    }

    return false;
  },
  component: KeyValueFieldComponent,
};
