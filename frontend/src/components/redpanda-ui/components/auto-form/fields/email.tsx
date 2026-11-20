'use client';

import { MailIcon } from 'lucide-react';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { StringLikeInput } from './shared';
import { useFieldTestIds } from './use-field-test-ids';

function EmailFieldComponent(props: AutoFormFieldProps) {
  const testIds = useFieldTestIds(props.id);

  return (
    <StringLikeInput
      error={props.error}
      icon={<MailIcon className="size-4" />}
      id={props.id}
      inputProps={props.inputProps}
      placeholder={getFieldUiConfig(props.field).placeholder}
      testId={testIds.control}
      type="email"
    />
  );
}

export { EmailFieldComponent };
