import { useAutoForm } from '../context';
import type { ParsedField, Renderable } from '../core-types';
import { getLabel, getPathInObject } from '../field-utils';
import { resolveRenderFieldType } from '../helpers';
import { getFieldUiConfig, isRecord } from '../ui-config';

export function cloneFieldWithDisabled(field: ParsedField, disabled: boolean): ParsedField {
  if (!disabled) {
    return field;
  }

  return {
    ...field,
    fieldConfig: {
      ...field.fieldConfig,
      inputProps: {
        ...field.fieldConfig?.inputProps,
        disabled: true,
      },
    },
  };
}

export function useFieldPresentation(field: ParsedField, path: string[], inheritedDisabled = false) {
  const { formValues, evaluateRules } = useAutoForm();
  const fieldValue = getPathInObject(formValues, path);
  const uiConfig = getFieldUiConfig(field);
  const customData = field.fieldConfig?.customData ?? {};
  const isHidden = Boolean(customData['hidden']);
  const isImmutable = Boolean(customData['immutable']);
  const isVisible = !isHidden && evaluateRules(uiConfig.visibleWhen, fieldValue);
  const isDisabledByRule =
    (uiConfig.disabledWhen?.length ?? 0) > 0 ? evaluateRules(uiConfig.disabledWhen, fieldValue) : false;
  const isDisabled = inheritedDisabled || isDisabledByRule || isImmutable;
  const renderField = cloneFieldWithDisabled(field, isDisabled);

  return {
    fieldValue,
    isDisabled,
    isVisible,
    renderField,
    renderType: resolveRenderFieldType(field),
  };
}

export function cloneFieldForCompactRow(field: ParsedField): ParsedField {
  const label = getLabel(field);
  const fallbackPlaceholder =
    field.type === 'select' || field.type === 'boolean' || typeof label !== 'string' ? undefined : label;

  const placeholder = field.fieldConfig?.inputProps?.['placeholder'];
  const existingCustomData = field.fieldConfig?.customData ?? {};
  const existingUi = isRecord(existingCustomData['ui']) ? existingCustomData['ui'] : {};

  return {
    ...field,
    fieldConfig: {
      ...field.fieldConfig,
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
        ...field.fieldConfig?.inputProps,
        placeholder: typeof placeholder === 'string' && placeholder !== '' ? placeholder : fallbackPlaceholder,
      },
    },
  };
}

export function getRenderedLabel(field: ParsedField): Renderable {
  if (typeof field.fieldConfig?.label === 'string') {
    return field.fieldConfig.label;
  }

  return getLabel(field);
}

export function isComplexCollectionField(field: ParsedField | undefined): boolean {
  if (field === undefined) {
    return false;
  }

  const renderType = resolveRenderFieldType(field);
  return ['object', 'array', 'map', 'oneof', 'json'].includes(renderType);
}
