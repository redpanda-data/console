'use client';

import { useFormContext } from 'react-hook-form';

import { AutoFormFieldRenderer } from './index';
import { getRenderedLabel, useFieldPresentation } from './shared';
import { Text } from '../../typography';
import { useAutoFormRenderContext, useAutoFormRuntimeContext } from '../context';
import type { ParsedField } from '../core-types';
import { getPathInObject } from '../field-utils';
import { getFieldErrorMessage } from '../helpers';
import { getAutoFormFieldTestId } from '../test-ids';

export function ObjectFieldRenderer({
  field,
  path,
  inheritedDisabled = false,
}: {
  field: ParsedField;
  path: string[];
  inheritedDisabled?: boolean;
}) {
  const { uiComponents } = useAutoFormRenderContext();
  const {
    formState: { errors },
  } = useFormContext<Record<string, unknown>>();
  const fullPath = path.join('.');
  const error = getFieldErrorMessage(errors, path);
  const label = getRenderedLabel(field);
  const { isVisible, renderField } = useFieldPresentation(field, path, inheritedDisabled);
  const { testIdPrefix } = useAutoFormRuntimeContext();

  // Check for errors on the object itself or any descendant field.
  // This ensures collapsible sections auto-expand when a child has an error.
  const errorAtPath = getPathInObject(errors as Record<string, unknown>, path);
  const hasDescendantError = errorAtPath !== undefined && errorAtPath !== null && typeof errorAtPath === 'object';
  const hasError = Boolean(error) || hasDescendantError;

  if (!isVisible) {
    return null;
  }

  const ObjectWrapperComponent = uiComponents.ObjectWrapper;

  // Render the error inline as a sibling of the section only when present.
  // The previous version reserved a `min-h-5` slot unconditionally, which
  // added ~20px of whitespace under every nested object and drifted the
  // rhythm away from manually-composed Field-based forms. A naked
  // `<section>` + optional error line lets the parent's `formSpacing.form`
  // token drive the gap between siblings without any extra padding.
  return (
    <>
      <ObjectWrapperComponent field={renderField} hasError={hasError} label={label}>
        {(renderField.schema ?? []).map((subField) => (
          <AutoFormFieldRenderer
            field={subField}
            inheritedDisabled={Boolean(renderField.fieldConfig?.inputProps?.disabled)}
            key={`${path.join('.')}.${subField.key}`}
            path={[...path, subField.key]}
          />
        ))}
      </ObjectWrapperComponent>
      {error ? (
        <Text
          className="whitespace-pre-wrap text-destructive"
          data-testid={getAutoFormFieldTestId(testIdPrefix, fullPath, 'error')}
          variant="small"
        >
          {error}
        </Text>
      ) : null}
    </>
  );
}
