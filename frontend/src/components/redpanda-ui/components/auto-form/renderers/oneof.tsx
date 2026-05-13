'use client';

import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { AutoFormFieldRenderer } from './index';
import { getRenderedLabel, useFieldPresentation } from './shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../select';
import { useAutoFormRenderContext, useAutoFormRuntimeContext } from '../context';
import type { ParsedField } from '../core-types';
import { getLabel } from '../field-utils';
import { formSpacing } from '../form-spacing';
import { createEmptyFieldValue, getFieldErrorMessage, getFieldUiConfig, UNSET_SELECT_VALUE } from '../helpers';
import { FormDepthProvider, useFormDepth } from '../layout-context';
import { getAutoFormFieldTestId } from '../test-ids';

export function OneofFieldRenderer({
  field,
  path,
  inheritedDisabled = false,
}: {
  field: ParsedField;
  path: string[];
  inheritedDisabled?: boolean;
}) {
  const { uiComponents } = useAutoFormRenderContext();
  const { evaluateRules } = useAutoFormRuntimeContext();
  const form = useFormContext<Record<string, unknown>>();
  const fullPath = path.join('.');
  const oneofValue = (useWatch({ name: fullPath }) as { case?: string; value?: unknown } | undefined) ?? {
    case: undefined,
    value: undefined,
  };
  const error = getFieldErrorMessage(form.formState.errors, path);
  const label = getRenderedLabel(field);
  const { isDisabled, isVisible, renderField } = useFieldPresentation(field, path, inheritedDisabled);
  const FieldWrapperComponent = field.fieldConfig?.fieldWrapper || uiComponents.FieldWrapper;
  const { testIdPrefix } = useAutoFormRuntimeContext();
  const controlTestId = getAutoFormFieldTestId(testIdPrefix, fullPath, 'control');
  const depth = useFormDepth();

  const availableFields = (field.schema ?? []).filter((candidate) => {
    const candidateUi = getFieldUiConfig(candidate);
    const candidateValue = candidate.key === oneofValue.case ? oneofValue.value : undefined;
    return evaluateRules(candidateUi.visibleWhen, candidateValue);
  });

  const selectedField = availableFields.find((candidate) => candidate.key === oneofValue.case);

  React.useEffect(() => {
    if (!oneofValue.case) {
      return;
    }

    const stillAvailable = availableFields.some((candidate) => candidate.key === oneofValue.case);
    if (!stillAvailable) {
      form.setValue(
        fullPath,
        { case: undefined, value: undefined },
        { shouldDirty: true, shouldTouch: true, shouldValidate: true }
      );
    }
  }, [availableFields, form, fullPath, oneofValue.case]);

  if (!isVisible) {
    return null;
  }

  return (
    <FieldWrapperComponent error={error} field={renderField} id={fullPath} label={label}>
      <div className={formSpacing.oneofStack}>
        <Select
          onValueChange={(value) => {
            if (isDisabled) {
              return;
            }
            if (value === UNSET_SELECT_VALUE) {
              form.setValue(
                fullPath,
                { case: undefined, value: undefined },
                { shouldDirty: true, shouldValidate: true }
              );
              return;
            }
            const nextField = availableFields.find((candidate) => candidate.key === value);
            form.clearErrors(`${fullPath}.value`);
            form.setValue(
              fullPath,
              {
                case: value,
                value: oneofValue.case === value ? oneofValue.value : createEmptyFieldValue(nextField),
              },
              { shouldDirty: true, shouldTouch: true, shouldValidate: true }
            );
          }}
          value={oneofValue.case ?? UNSET_SELECT_VALUE}
        >
          <SelectTrigger aria-label={String(label)} disabled={isDisabled} id={fullPath} testId={controlTestId}>
            <SelectValue placeholder="Choose a field" />
          </SelectTrigger>
          <SelectContent>
            {field.required ? null : (
              <SelectItem
                testId={getAutoFormFieldTestId(testIdPrefix, fullPath, 'option-not-set')}
                value={UNSET_SELECT_VALUE}
              >
                Not set
              </SelectItem>
            )}
            {availableFields.map((candidate) => (
              <SelectItem
                key={candidate.key}
                testId={getAutoFormFieldTestId(testIdPrefix, fullPath, `option-${candidate.key}`)}
                value={candidate.key}
              >
                {getLabel(candidate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedField ? (
          selectedField.type === 'object' && (!selectedField.schema || selectedField.schema.length === 0) ? (
            <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3">
              <p className="text-muted-foreground text-sm">
                {getLabel(selectedField)} selected. No additional configuration needed.
              </p>
            </div>
          ) : (
            // Oneof values render conceptually one level deeper than the
            // selector itself. Bumping depth here keeps headings consulted
            // by ObjectWrapper consistent with siblings reached via
            // plain nested-object paths.
            <FormDepthProvider depth={depth + 1}>
              <AutoFormFieldRenderer field={selectedField} inheritedDisabled={isDisabled} path={[...path, 'value']} />
            </FormDepthProvider>
          )
        ) : null}
      </div>
    </FieldWrapperComponent>
  );
}
