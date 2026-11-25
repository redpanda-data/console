'use client';

import { Textarea } from '../../textarea';
import { getProtoFieldCustomData } from '../../../lib/protobuf-provider';
import type { AutoFormFieldProps } from '../core-types';
import { FIELD_MASK_PATH_SPLIT_PATTERN } from '../helpers';
import { getFieldUiConfig } from '../ui-config';
import { useFieldTestIds } from './use-field-test-ids';

function FieldMaskFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const allowedPaths = getProtoFieldCustomData(field)?.allowedPaths;
  const textValue = Array.isArray(inputProps.value) ? inputProps.value.join('\n') : '';

  return (
    <div className="space-y-2">
      <Textarea
        aria-invalid={Boolean(error)}
        disabled={inputProps.disabled}
        id={id}
        onBlur={inputProps.onBlur}
        onChange={(event) => {
          const paths = event.target.value
            .split(FIELD_MASK_PATH_SPLIT_PATTERN)
            .map((entry) => entry.trim())
            .filter(Boolean);
          inputProps.onValueChange(paths);
        }}
        placeholder={getFieldUiConfig(field).placeholder ?? 'profile\nnotifications.email'}
        resize="vertical"
        testId={testIds.control}
        textStyle="monospace"
        value={textValue}
      />
      {allowedPaths !== undefined && allowedPaths.length > 0 ? (
        <div className="text-body-sm text-subtle">Allowed paths: {allowedPaths.join(', ')}</div>
      ) : null}
    </div>
  );
}

export { FieldMaskFieldComponent };
