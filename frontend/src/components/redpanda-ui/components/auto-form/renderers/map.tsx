'use client';

import { clsx } from 'clsx';
import { TrashIcon } from 'lucide-react';
import type React from 'react';
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

const COMPACT_PAIR_GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3';
const KEY_REMOVE_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3';

export function MapFieldRenderer({
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
  const keyField = field.schema?.[0];
  const valueField = field.schema?.[1];
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
  const compactKeyField = keyField === undefined ? undefined : cloneFieldForCompactRow(keyField);
  const compactValueField = valueField === undefined ? undefined : cloneFieldForCompactRow(valueField);
  const valueIsComplex = isComplexCollectionField(valueField);

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
          append({ key: '', value: createEmptyFieldValue(valueField) });
        }}
        testId={getAutoFormFieldTestId(testIdPrefix, fullPath, 'items')}
      >
        {rhfFields.map((rhfField, index) => {
          const rowTestId = getAutoFormCollectionRowTestId(testIdPrefix, fullPath, index);
          const removeButtonTestId = getAutoFormCollectionRemoveTestId(testIdPrefix, fullPath, index);
          const removeEntry = () => {
            if (isDisabled) {
              return;
            }
            remove(index);
          };

          if (compactKeyField !== undefined && compactValueField !== undefined && !valueIsComplex) {
            return (
              <div
                className={index > 0 ? clsx(COMPACT_PAIR_GRID, formSpacing.arrayItemSeparator) : COMPACT_PAIR_GRID}
                data-testid={rowTestId}
                key={rhfField.id}
              >
                <NestedField
                  field={compactKeyField}
                  inheritedDisabled={isDisabled}
                  path={[...path, String(index), 'key']}
                />
                <NestedField
                  field={compactValueField}
                  inheritedDisabled={isDisabled}
                  path={[...path, String(index), 'value']}
                />
                <Button
                  aria-label="Remove item"
                  disabled={isDisabled}
                  onClick={removeEntry}
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
            <div
              className={
                index > 0 ? clsx(formSpacing.collectionRow, formSpacing.arrayItemSeparator) : formSpacing.collectionRow
              }
              data-testid={rowTestId}
              key={rhfField.id}
            >
              <div className={KEY_REMOVE_GRID}>
                {compactKeyField === undefined ? null : (
                  <NestedField
                    field={compactKeyField}
                    inheritedDisabled={isDisabled}
                    path={[...path, String(index), 'key']}
                  />
                )}
                <Button
                  aria-label="Remove item"
                  disabled={isDisabled}
                  onClick={removeEntry}
                  size="icon-sm"
                  testId={removeButtonTestId}
                  type="button"
                  variant="ghost"
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
              {valueField === undefined ? null : (
                <NestedField
                  field={compactValueField ?? valueField}
                  inheritedDisabled={isDisabled}
                  path={[...path, String(index), 'value']}
                />
              )}
            </div>
          );
        })}
      </ArrayWrapperComponent>
    </FieldWrapperComponent>
  );
}
