'use client';

import React from 'react';
import { useController, useFormContext } from 'react-hook-form';

import { getRenderedLabel, useFieldPresentation } from './shared';
import { useAutoFormRenderContext, useAutoFormRuntimeContext } from '../context';
import type { AutoFormFieldProps, ParsedField } from '../core-types';
import { getFieldErrorMessage } from '../helpers';
import { getAutoFormFieldTestId } from '../test-ids';

export function ControlledFieldRenderer({
  field,
  path,
  renderType,
  inheritedDisabled = false,
}: {
  field: ParsedField;
  path: string[];
  renderType?: string;
  inheritedDisabled?: boolean;
}) {
  const { formComponents, uiComponents } = useAutoFormRenderContext();
  const {
    formState: { errors },
  } = useFormContext<Record<string, unknown>>();
  const fullPath = path.join('.');
  const label = getRenderedLabel(field);
  const error = getFieldErrorMessage(errors, path);
  const { field: controllerField } = useController({ name: fullPath });
  const {
    isVisible,
    renderField,
    renderType: inferredRenderType,
  } = useFieldPresentation(field, path, inheritedDisabled);
  const { testIdPrefix } = useAutoFormRuntimeContext();

  if (!isVisible) {
    return null;
  }

  const resolvedRenderType = renderType ?? inferredRenderType;
  const FieldWrapperComponent = field.fieldConfig?.fieldWrapper || uiComponents.FieldWrapper;
  const FieldComponent = (formComponents[resolvedRenderType] ??
    formComponents[renderField.type] ??
    formComponents.fallback) as React.ComponentType<AutoFormFieldProps>;

  return (
    <FieldWrapperComponent error={error} field={renderField} id={fullPath} label={label}>
      <FieldComponent
        error={error}
        field={renderField}
        id={fullPath}
        inputProps={{
          ...renderField.fieldConfig?.inputProps,
          name: controllerField.name,
          onBlur: controllerField.onBlur,
          onValueChange: controllerField.onChange,
          ref: controllerField.ref,
          required: renderField.required,
          testId: getAutoFormFieldTestId(testIdPrefix, path, 'control'),
          value: controllerField.value,
        }}
        label={label}
        path={path}
        value={controllerField.value}
      />
    </FieldWrapperComponent>
  );
}
