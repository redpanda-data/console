'use client';

import { useAutoFormRenderContext } from '../context';
import type { AutoFormFieldProps } from '../core-types';

function MissingFieldComponent({ field }: AutoFormFieldProps) {
  const { uiComponents } = useAutoFormRenderContext();

  return (
    <uiComponents.ErrorMessage error={`[AutoForm Configuration Error] No component found for type "${field.type}".`} />
  );
}

export { MissingFieldComponent };
