'use client';

import { TrashIcon } from 'lucide-react';
import React from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { AutoFormFieldRenderer } from './index';
import { cloneFieldForCompactRow, getRenderedLabel, isComplexCollectionField, useFieldPresentation } from './shared';
import { Button } from '../../button';
import { useAutoFormRenderContext, useAutoFormRuntimeContext } from '../context';
import type { ParsedField } from '../core-types';
import { formSpacing } from '../form-spacing';
import { createEmptyFieldValue, getFieldErrorMessage } from '../helpers';
import { getAutoFormCollectionRemoveTestId, getAutoFormCollectionRowTestId, getAutoFormFieldTestId } from '../test-ids';

const COMPACT_ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3';

export function ArrayFieldRenderer({
  field,
  path,
  inheritedDisabled = false,
}: {
  field: ParsedField;
  path: string[];
  inheritedDisabled?: boolean;
}) {
  const { uiComponents } = useAutoFormRenderContext();
  const form = useFormContext<Record<string, unknown>>();
  const { testIdPrefix } = useAutoFormRuntimeContext();
  const fullPath = path.join('.');
  const { fields: rhfFields, append, remove } = useFieldArray({ control: form.control, name: fullPath as never });
  const itemField = field.schema?.[0];
  const error = getFieldErrorMessage(form.formState.errors, path);
  const label = getRenderedLabel(field);
  const { isDisabled, isVisible, renderField } = useFieldPresentation(field, path, inheritedDisabled);
  const FieldWrapperComponent = field.fieldConfig?.fieldWrapper || uiComponents.FieldWrapper;
  const ArrayWrapperComponent = uiComponents.ArrayWrapper as React.ComponentType<
    React.ComponentProps<typeof uiComponents.ArrayWrapper> & {
      addButtonTestId?: string;
      testId?: string;
    }
  >;
  const ArrayElementWrapperComponent = uiComponents.ArrayElementWrapper as React.ComponentType<
    React.ComponentProps<typeof uiComponents.ArrayElementWrapper> & {
      removeButtonTestId?: string;
      testId?: string;
    }
  >;
  const compactItemField = itemField ? cloneFieldForCompactRow(itemField) : undefined;
  const useCompactRows = itemField ? !isComplexCollectionField(itemField) : false;

  // If the array is required and currently empty, seed a single blank
  // item so the user can start typing immediately instead of having to
  // click "Add <Label>" first. `buf.validate.field.repeated.min_items`
  // propagates onto the ParsedField as `required: true`, so a single
  // check is enough. Only runs once per mount-when-empty — subsequent
  // user-initiated removals are respected.
  const hasSeededRef = React.useRef(false);
  React.useEffect(() => {
    if (hasSeededRef.current || isDisabled || !field.required || rhfFields.length > 0 || !itemField) {
      return;
    }
    hasSeededRef.current = true;
    append(createEmptyFieldValue(itemField) as never);
  }, [append, field.required, isDisabled, itemField, rhfFields.length]);

  if (!isVisible) {
    return null;
  }

  return (
    <FieldWrapperComponent error={error} field={renderField} id={fullPath} label={label}>
      <ArrayWrapperComponent
        addButtonTestId={getAutoFormFieldTestId(testIdPrefix, fullPath, 'add')}
        field={renderField}
        label={String(label)}
        onAddItem={() => {
          if (isDisabled) {
            return;
          }
          append(createEmptyFieldValue(itemField) as never);
        }}
        testId={getAutoFormFieldTestId(testIdPrefix, fullPath, 'items')}
      >
        {rhfFields.map((rhfField, index) => {
          const rowTestId = getAutoFormCollectionRowTestId(testIdPrefix, fullPath, index);
          const removeButtonTestId = getAutoFormCollectionRemoveTestId(testIdPrefix, fullPath, index);
          const removeItem = () => {
            if (isDisabled) {
              return;
            }
            remove(index);
          };

          if (compactItemField && useCompactRows) {
            return (
              <div
                className={index > 0 ? `${COMPACT_ROW_GRID} ${formSpacing.arrayItemSeparator}` : COMPACT_ROW_GRID}
                data-testid={rowTestId}
                key={rhfField.id}
              >
                <AutoFormFieldRenderer
                  field={compactItemField}
                  inheritedDisabled={isDisabled}
                  path={[...path, String(index)]}
                />
                <Button
                  aria-label="Remove item"
                  disabled={isDisabled}
                  onClick={removeItem}
                  size="icon-sm"
                  testId={removeButtonTestId}
                  type="button"
                  variant="ghost"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            );
          }

          return (
            <ArrayElementWrapperComponent
              index={index}
              key={rhfField.id}
              onRemove={removeItem}
              removeButtonTestId={removeButtonTestId}
              testId={rowTestId}
            >
              {itemField ? (
                <AutoFormFieldRenderer
                  field={itemField}
                  inheritedDisabled={isDisabled}
                  path={[...path, String(index)]}
                />
              ) : null}
            </ArrayElementWrapperComponent>
          );
        })}
      </ArrayWrapperComponent>
    </FieldWrapperComponent>
  );
}
