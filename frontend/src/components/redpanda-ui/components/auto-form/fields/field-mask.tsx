'use client';

import { useFieldTestIds } from './shared';
import { Textarea } from '../../textarea';
import { Text } from '../../typography';
import type { AutoFormFieldProps } from '../core-types';
import { FIELD_MASK_PATH_SPLIT_PATTERN, getFieldUiConfig } from '../helpers';
import { getProtoFieldCustomData } from '../proto';
import type { FieldTypeDefinition } from '../registry';

function FieldMaskFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const allowedPaths = getProtoFieldCustomData(field)?.allowedPaths;
  const textValue = Array.isArray(inputProps.value) ? inputProps.value.join('\n') : '';

  return (
    <div className="space-y-2">
      <Textarea
        aria-invalid={Boolean(error)}
        className={error ? 'border-destructive font-mono' : 'font-mono'}
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
        placeholder={getFieldUiConfig(field).placeholder || 'profile\nnotifications.email'}
        resize="vertical"
        testId={testIds.control}
        value={textValue}
      />
      {allowedPaths?.length ? (
        <Text className="text-muted-foreground" variant="small">
          Allowed paths: {allowedPaths.join(', ')}
        </Text>
      ) : null}
    </div>
  );
}

export { FieldMaskFieldComponent };

export const fieldMaskFieldDefinition: FieldTypeDefinition = {
  name: 'fieldMask',
  priority: 10,
  match: (field) => field.type === 'fieldMask',
  component: FieldMaskFieldComponent,
};
