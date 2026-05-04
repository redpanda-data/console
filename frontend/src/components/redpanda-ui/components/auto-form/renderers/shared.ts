import React from 'react';

import { useAutoFormRuntimeContext } from '../context';
import type { ParsedField } from '../core-types';
import { getLabel, getPathInObject } from '../field-utils';
import { getFieldUiConfig, resolveRenderFieldType } from '../helpers';

export function cloneFieldWithDisabled(field: ParsedField, disabled: boolean): ParsedField {
  if (!disabled) {
    return field;
  }

  return {
    ...field,
    fieldConfig: {
      ...(field.fieldConfig ?? {}),
      inputProps: {
        ...(field.fieldConfig?.inputProps ?? {}),
        disabled: true,
      },
    },
  };
}

export function useFieldPresentation(field: ParsedField, path: string[], inheritedDisabled = false) {
  const { formValues, evaluateRules } = useAutoFormRuntimeContext();
  const fieldValue = getPathInObject(formValues, path);
  const uiConfig = getFieldUiConfig(field);
  const customData = (field.fieldConfig?.customData ?? {}) as Record<string, unknown>;
  const isHidden = Boolean(customData.hidden);
  const isImmutable = Boolean(customData.immutable);
  const isVisible = !isHidden && evaluateRules(uiConfig.visibleWhen, fieldValue);
  const isDisabledByRule = uiConfig.disabledWhen?.length ? evaluateRules(uiConfig.disabledWhen, fieldValue) : false;
  const isDisabled = inheritedDisabled || isDisabledByRule || isImmutable;
  const renderField = React.useMemo(() => cloneFieldWithDisabled(field, isDisabled), [field, isDisabled]);

  return {
    fieldValue,
    isDisabled,
    isVisible,
    renderField,
    renderType: resolveRenderFieldType(field),
  };
}

export function cloneFieldForCompactRow(field: ParsedField): ParsedField {
  const label = String(getLabel(field));

  const existingCustomData = (field.fieldConfig?.customData ?? {}) as Record<string, unknown>;
  const existingUi = (existingCustomData.ui ?? {}) as Record<string, unknown>;

  return {
    ...field,
    fieldConfig: {
      ...(field.fieldConfig ?? {}),
      label: '',
      description: '',
      customData: {
        ...existingCustomData,
        compactRow: true,
        ui: {
          ...existingUi,
          help: '',
          example: '',
        },
      },
      inputProps: {
        ...(field.fieldConfig?.inputProps ?? {}),
        placeholder:
          (field.fieldConfig?.inputProps?.placeholder as string | undefined) ||
          (field.type === 'select' || field.type === 'boolean' ? undefined : label),
      },
    },
  };
}

export function getRenderedLabel(field: ParsedField): string {
  if (typeof field.fieldConfig?.label === 'string') {
    return field.fieldConfig.label;
  }

  return String(getLabel(field));
}

export function isComplexCollectionField(field: ParsedField | undefined): boolean {
  if (!field) {
    return false;
  }

  const renderType = resolveRenderFieldType(field);
  return ['object', 'array', 'map', 'oneof', 'json'].includes(renderType);
}
