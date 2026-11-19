'use client';

import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { StringLikeInput } from './shared';
import { useFieldTestIds } from './use-field-test-ids';

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
