'use client';

import { Link2Icon } from 'lucide-react';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { StringLikeInput } from './shared';
import { useFieldTestIds } from './use-field-test-ids';

function UrlFieldComponent(props: AutoFormFieldProps) {
  const testIds = useFieldTestIds(props.id);

  return (
    <StringLikeInput
      error={props.error}
      icon={<Link2Icon className="size-4" />}
      id={props.id}
      inputProps={props.inputProps}
      placeholder={getFieldUiConfig(props.field).placeholder ?? 'https://'}
      testId={testIds.control}
      type="url"
    />
  );
}

export { UrlFieldComponent };
