'use client';

import { JSONField } from '../../json-field';
import { isJSONValue, validateJSONValue } from '../../json-field/json-value';
import { getProtoFieldCustomData } from '../../../lib/protobuf-provider';
import type { AutoFormFieldProps } from '../core-types';
import { getProtoJsonSchema } from '../proto/conversion';
import { useFieldTestIds } from './use-field-test-ids';

function JsonFieldComponent({ field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const value = inputProps.value ?? (getProtoFieldCustomData(field)?.jsonKind === 'listValue' ? [] : {});

  return (
    <JSONField
      maxDepth={3}
      onBlur={inputProps.onBlur}
      onChange={inputProps.onValueChange}
      schema={getProtoJsonSchema(field)}
      showPlaceholder={false}
      testId={testIds.control}
      value={isJSONValue(value) ? value : validateJSONValue(value)}
    />
  );
}

export { JsonFieldComponent };
