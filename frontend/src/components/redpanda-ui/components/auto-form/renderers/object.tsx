'use client';

import { useFormContext } from 'react-hook-form';

import { AutoFormFieldRenderer } from './index';
import { getRenderedLabel, useFieldPresentation } from './shared';
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

  // Include descendant errors so collapsible sections auto-expand when a child is invalid.
  const errorAtPath = getPathInObject(errors as Record<string, unknown>, path);
  const hasDescendantError = errorAtPath !== undefined && errorAtPath !== null && typeof errorAtPath === 'object';
  const hasError = Boolean(error) || hasDescendantError;

  if (!isVisible) {
    return null;
  }

  const ObjectWrapperComponent = uiComponents.ObjectWrapper;

  // Render the error inline only when present (no reserved slot) so the parent's
  // formSpacing.form token drives sibling gaps without extra whitespace.
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
        <div
          className="whitespace-pre-wrap text-body-sm text-destructive"
          data-testid={getAutoFormFieldTestId(testIdPrefix, fullPath, 'error')}
        >
          {error}
        </div>
      ) : null}
    </>
  );
}
