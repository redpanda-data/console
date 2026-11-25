'use client';

import { useController, useFormContext } from 'react-hook-form';
import { useAutoForm } from '../context';
import type { AutoFormValue, ParsedField } from '../core-types';
import { getFieldErrorMessage } from '../helpers';
import { getAutoFormFieldTestId } from '../test-ids';
import { getRenderedLabel, useFieldPresentation } from './shared';

export function ControlledFieldRenderer({
  field,
  path,
  renderType,
  inheritedDisabled = false,
}: {
  field: ParsedField;
  path: string[];
  renderType?: string | undefined;
  inheritedDisabled?: boolean | undefined;
}) {
  const { formComponents, uiComponents, testIdPrefix } = useAutoForm();
  const {
    formState: { errors },
  } = useFormContext<Record<string, unknown>>();
  const fullPath = path.join('.');
  const label = getRenderedLabel(field);
  const error = getFieldErrorMessage(errors, path, field.type);
  const { field: controllerField } = useController<Record<string, unknown>>({ name: fullPath });
  const {
    isVisible,
    renderField,
    renderType: inferredRenderType,
  } = useFieldPresentation(field, path, inheritedDisabled);

  if (!isVisible) {
    return null;
  }

  const resolvedRenderType = renderType ?? inferredRenderType;
  const FieldWrapperComponent = field.fieldConfig?.fieldWrapper ?? uiComponents.FieldWrapper;
  const FieldComponent = formComponents[resolvedRenderType] ?? formComponents['fallback'];
  if (FieldComponent === undefined) {
    throw new Error(`No form renderer is registered for ${resolvedRenderType}.`);
  }
  const value = requireFormValue(controllerField.value);

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
          value,
        }}
        label={label}
        path={path}
        value={value}
      />
    </FieldWrapperComponent>
  );
}

function requireFormValue(value: unknown): AutoFormValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'object'
  ) {
    return value;
  }
  throw new TypeError('Form values must be scalars or structured data, not functions or symbols.');
}
