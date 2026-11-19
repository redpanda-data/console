'use client';

import { useFormContext } from 'react-hook-form';
import { KeyValueField } from '../../key-value-field';
import { describeKeyValueRowChange } from '../../key-value-field/rows';
import { getProtoFieldCustomData } from '../../../lib/protobuf-provider';
import { omitUndefined } from '../../../lib/utils/omit-undefined';
import { requireDefined } from '../../../lib/utils/require-defined';
import type { AutoFormFieldProps } from '../core-types';
import {
  denormalizeKeyValueEntries,
  getFieldErrorMessage,
  normalizeKeyValueEntries,
  resolveRenderFieldType,
} from '../helpers';
import { useFormCollection } from '../renderers/use-form-collection';
import { getFieldUiConfig } from '../ui-config';
import { useFieldTestIds } from './use-field-test-ids';

function KeyValueFieldComponent({ field, id, inputProps, path }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const fullPath = path.join('.');
  const form = useFormContext<Record<string, unknown[]>>();
  const { fields, append, remove } = useFormCollection(fullPath);
  // The collection owner updates synchronously; controller props may lag its append commit.
  const pairs = normalizeKeyValueEntries(form.getValues(fullPath));
  const rows = fields.map((row, index) => ({
    id: row.id,
    pair: requireDefined(pairs[index], 'Expected a key-value pair for the form row.'),
  }));
  const valueField =
    field.type === 'map'
      ? field.schema?.[1]
      : field.schema?.[0]?.schema?.find((candidate) => candidate.key === 'value');
  const valueRenderType = valueField === undefined ? undefined : resolveRenderFieldType(valueField);
  const protoData = getProtoFieldCustomData(field);

  const valueFieldProps =
    valueRenderType === 'select' || valueRenderType === 'combobox' || valueRenderType === 'radio'
      ? {
          mode: 'combobox' as const,
          options: (valueField?.options ?? []).map(([value, optionLabel]) => ({ value, label: optionLabel })),
          placeholder: getFieldUiConfig(valueField ?? field).placeholder ?? 'Value',
        }
      : {
          placeholder: getFieldUiConfig(valueField ?? field).placeholder ?? 'Value',
        };

  return (
    <KeyValueField
      addButtonLabel="Add pair"
      disabled={inputProps.disabled}
      errors={rows.map((_, index) =>
        omitUndefined({
          key: getFieldErrorMessage(form.formState.errors, [...path, String(index), 'key']),
          value: getFieldErrorMessage(form.formState.errors, [...path, String(index), 'value']),
        })
      )}
      keyFieldProps={{ placeholder: 'Key' }}
      maxItems={protoData?.maxPairs}
      onChange={(nextRows) => {
        const change = describeKeyValueRowChange(rows, nextRows);
        switch (change.type) {
          case 'append':
            append(denormalizeKeyValueEntries([change.pair], field), { shouldFocus: false });
            break;
          case 'remove':
            remove(change.index);
            break;
          case 'edit':
            inputProps.onValueChange(denormalizeKeyValueEntries(change.pairs, field));
            break;
          default:
            throw new TypeError('Unexpected key-value row action.', { cause: change satisfies never });
        }
      }}
      showAddButton
      testId={testIds.control}
      value={rows}
      valueFieldProps={valueFieldProps}
    />
  );
}

export { KeyValueFieldComponent };
