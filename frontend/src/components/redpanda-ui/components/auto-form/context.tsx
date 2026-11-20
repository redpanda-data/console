import React from 'react';

import type { AutoFormFieldComponents, AutoFormUIComponents, ParsedField } from './core-types';
import type { DataProviderRegistry } from './data-providers';
import { getPathInObject } from './field-utils';
import type { FieldTypeRegistry } from './registry';
import type { AutoFormUiRule } from './types';
import type { FieldUiConfig } from './ui-config';

export interface AutoFormContextValue {
  dataProviders?: DataProviderRegistry | undefined;
  evaluateRules: (rules: AutoFormUiRule[] | undefined, fieldValue?: unknown) => boolean;
  fieldRegistry?: FieldTypeRegistry | undefined;
  formComponents: AutoFormFieldComponents;
  formValues: Record<string, unknown>;
  getFieldUiConfig: (field: ParsedField) => FieldUiConfig;
  testIdPrefix: string;
  uiComponents: AutoFormUIComponents;
}

export const AutoFormContext = React.createContext<AutoFormContextValue | null>(null);

export function useAutoForm(): AutoFormContextValue {
  const context = React.useContext(AutoFormContext);
  if (context === null) {
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
