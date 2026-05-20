import React from 'react';

import type { AutoFormFieldComponents, AutoFormUIComponents, ParsedField } from './core-types';
import type { DataProviderRegistry } from './data-providers';
import { getPathInObject } from './field-utils';
import type { FieldTypeRegistry } from './registry';
import type { AutoFormUiRule } from './types';

export type AutoFormContextValue = {
  uiComponents: AutoFormUIComponents;
  formComponents: AutoFormFieldComponents;
  formValues: Record<string, unknown>;
  evaluateRules: (rules: AutoFormUiRule[] | undefined, fieldValue?: unknown) => boolean;
  getFieldUiConfig: (field: ParsedField) => Record<string, unknown>;
  testIdPrefix: string;
  fieldRegistry?: FieldTypeRegistry;
  dataProviders?: DataProviderRegistry;
};

export const AutoFormContext = React.createContext<AutoFormContextValue | null>(null);

export function useAutoForm(): AutoFormContextValue {
  const context = React.useContext(AutoFormContext);
  if (!context) {
    throw new Error('useAutoForm must be used inside an AutoForm component.');
  }
  return context;
}

export function useAutoFormField(path: string[]) {
  const { formValues, evaluateRules, getFieldUiConfig: getUiConfig, testIdPrefix } = useAutoForm();
  const fieldValue = getPathInObject(formValues, path);

  return {
    fieldValue,
    evaluateRules,
    getFieldUiConfig: getUiConfig,
    testIdPrefix,
  };
}

// ---------------------------------------------------------------------------
// Legacy aliases – kept during migration, will be removed once all consumers
// switch to useAutoForm().
// ---------------------------------------------------------------------------

export type InternalAutoFormRenderContextValue = Pick<AutoFormContextValue, 'uiComponents' | 'formComponents'>;
export type InternalAutoFormRuntimeContextValue = Pick<
  AutoFormContextValue,
  'formValues' | 'evaluateRules' | 'getFieldUiConfig' | 'testIdPrefix'
>;

export const AutoFormRenderContext = AutoFormContext;
export const AutoFormRuntimeContext = AutoFormContext;

export function useAutoFormRenderContext(): InternalAutoFormRenderContextValue {
  return useAutoForm();
}

export function useAutoFormRuntimeContext(): InternalAutoFormRuntimeContextValue {
  return useAutoForm();
}
