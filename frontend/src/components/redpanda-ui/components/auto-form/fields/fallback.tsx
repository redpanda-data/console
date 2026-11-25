'use client';

import { useAutoForm } from '../context';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';

function MissingFieldComponent({ field }: AutoFormFieldProps) {
  const { uiComponents } = useAutoForm();

  return (
    <uiComponents.ErrorMessage
      error={`[AutoForm Configuration Error] No component found for type "${getFieldUiConfig(field).control ?? field.type}".`}
    />
  );
}

export { MissingFieldComponent };
