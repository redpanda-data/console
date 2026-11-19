'use client';

import { useFormContext } from 'react-hook-form';
import { useAutoForm } from '../context';
import type { ParsedField } from '../core-types';
import { getPathInObject } from '../field-utils';
import { getFieldErrorMessage } from '../helpers';
import { getAutoFormFieldTestId } from '../test-ids';
import type { NestedFieldRenderer } from './renderer-types';
import { getRenderedLabel, useFieldPresentation } from './shared';

export function ObjectFieldRenderer({
  NestedField,
  field,
  path,
  inheritedDisabled = false,
}: {
  NestedField: NestedFieldRenderer;
  field: ParsedField;
  path: string[];
  inheritedDisabled?: boolean | undefined;
}) {
  const { uiComponents, testIdPrefix } = useAutoForm();
  const {
    formState: { errors },
  } = useFormContext<Record<string, unknown>>();
  const fullPath = path.join('.');
  const error = getFieldErrorMessage(errors, path);
  const label = getRenderedLabel(field);
  const { isVisible, renderField } = useFieldPresentation(field, path, inheritedDisabled);

  // Include descendant errors so collapsible sections auto-expand when a child is invalid.
  const errorAtPath = getPathInObject(errors, path);
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
          <NestedField
            field={subField}
            inheritedDisabled={Boolean(renderField.fieldConfig?.inputProps?.['disabled'])}
            key={`${path.join('.')}.${subField.key}`}
            path={[...path, subField.key]}
          />
        ))}
      </ObjectWrapperComponent>
      {error !== undefined && error !== '' ? (
        <div
          className="text-body-sm whitespace-pre-wrap text-destructive"
          data-testid={getAutoFormFieldTestId(testIdPrefix, fullPath, 'error')}
        >
          {error}
        </div>
      ) : null}
    </>
  );
}
