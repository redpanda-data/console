'use client';

import { clsx } from 'clsx';
import { TrashIcon } from 'lucide-react';
import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from '../../button';
import { useAutoForm } from '../context';
import type { ParsedField } from '../core-types';
import { formSpacing } from '../form-spacing';
import { createEmptyFieldValue, getFieldErrorMessage } from '../helpers';
import { getAutoFormCollectionRemoveTestId, getAutoFormCollectionRowTestId, getAutoFormFieldTestId } from '../test-ids';
import type { NestedFieldRenderer } from './renderer-types';
import { cloneFieldForCompactRow, getRenderedLabel, isComplexCollectionField, useFieldPresentation } from './shared';
import { useFormCollection } from './use-form-collection';

const COMPACT_ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3';

export function ArrayFieldRenderer({
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
  const form = useFormContext<Record<string, unknown>>();
  const fullPath = path.join('.');
  const { fields: rhfFields, append, remove } = useFormCollection(fullPath);
  const itemField = field.schema?.[0];
  const error = getFieldErrorMessage(form.formState.errors, path, field.type);
  const label = getRenderedLabel(field);
  const { isDisabled, isVisible, renderField } = useFieldPresentation(field, path, inheritedDisabled);
  const FieldWrapperComponent = field.fieldConfig?.fieldWrapper ?? uiComponents.FieldWrapper;
  const ArrayWrapperComponent = uiComponents.ArrayWrapper as React.ComponentType<
    React.ComponentProps<typeof uiComponents.ArrayWrapper> & {
      addButtonTestId?: string;
      testId?: string | undefined;
    }
  >;
  const ArrayElementWrapperComponent = uiComponents.ArrayElementWrapper as React.ComponentType<
    React.ComponentProps<typeof uiComponents.ArrayElementWrapper> & {
      removeButtonTestId?: string;
      testId?: string | undefined;
    }
  >;
  const compactItemField = itemField === undefined ? undefined : cloneFieldForCompactRow(itemField);
  const useCompactRows = itemField === undefined ? false : !isComplexCollectionField(itemField);

  // Seed one blank item when a required array is empty so the user can type immediately.
  // Runs once per mount-when-empty so later user removals are respected.
  const hasSeededRef = React.useRef(false);
  React.useEffect(() => {
    if (hasSeededRef.current || isDisabled || !field.required || rhfFields.length > 0 || itemField === undefined) {
      return;
    }
    hasSeededRef.current = true;
    append(createEmptyFieldValue(itemField));
  }, [append, field.required, isDisabled, itemField, rhfFields.length]);

  if (!isVisible) {
    return null;
  }

  return (
    <FieldWrapperComponent error={error} field={renderField} id={fullPath} label={label}>
      <ArrayWrapperComponent
        addButtonTestId={getAutoFormFieldTestId(testIdPrefix, fullPath, 'add')}
        field={renderField}
        label={label}
        onAddItem={() => {
          if (isDisabled) {
            return;
          }
          append(createEmptyFieldValue(itemField));
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

          if (compactItemField !== undefined && useCompactRows) {
            return (
              <div
                className={index > 0 ? clsx(COMPACT_ROW_GRID, formSpacing.arrayItemSeparator) : COMPACT_ROW_GRID}
                data-testid={rowTestId}
                key={rhfField.id}
              >
                <NestedField field={compactItemField} inheritedDisabled={isDisabled} path={[...path, String(index)]} />
                <Button
                  aria-label="Remove item"
                  disabled={isDisabled}
                  onClick={removeItem}
                  size="icon-sm"
                  testId={removeButtonTestId}
                  type="button"
                  variant="ghost"
                >
                  <TrashIcon className="size-4" />
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
              {itemField === undefined ? null : (
                <NestedField field={itemField} inheritedDisabled={isDisabled} path={[...path, String(index)]} />
              )}
            </ArrayElementWrapperComponent>
          );
        })}
      </ArrayWrapperComponent>
    </FieldWrapperComponent>
  );
}
