'use client';

import React, { createContext, useContext } from 'react';

import { resolveSecretScopes } from './secret-selector-scopes';
import { useFieldTestIds } from './shared';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import { getProtoFieldCustomData } from '../proto';
import type { FieldTypeDefinition } from '../registry';

export interface SecretSelectorAdapterProps {
  value: string;
  onChange: (value: string) => void;
  scopes: readonly unknown[];
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  error?: string;
  testId?: string;
}

export type SecretSelectorAdapter = React.ComponentType<SecretSelectorAdapterProps>;

export const SecretSelectorAdapterContext = createContext<SecretSelectorAdapter | null>(null);

export function SecretSelectorAdapterProvider({
  adapter,
  children,
}: {
  adapter: SecretSelectorAdapter;
  children: React.ReactNode;
}) {
  return <SecretSelectorAdapterContext.Provider value={adapter}>{children}</SecretSelectorAdapterContext.Provider>;
}

function SecretSelectorFieldComponent(props: AutoFormFieldProps) {
  const testIds = useFieldTestIds(props.id);
  const customData = getProtoFieldCustomData(props.field);
  const scopes = resolveSecretScopes(customData?.secretScope);
  const uiConfig = getFieldUiConfig(props.field);
  const Adapter = useContext(SecretSelectorAdapterContext);

  const value = typeof props.value === 'string' ? props.value : '';

  if (!Adapter) {
    if (process.env.NODE_ENV !== 'production') {
      // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
      console.warn(
        `[AutoForm] Field "${props.field.key}" matched the secretSelector renderer but no adapter is registered. ` +
          'Wrap AutoForm with <SecretSelectorAdapterProvider adapter={...}> to inject your SecretSelector implementation.'
      );
    }
    return (
      <input
        aria-invalid={Boolean(props.error)}
        data-testid={testIds.control}
        disabled={props.inputProps.disabled}
        onChange={(event) => props.inputProps.onValueChange?.(event.target.value)}
        placeholder={uiConfig.placeholder}
        value={value}
      />
    );
  }

  return (
    <Adapter
      description={uiConfig.help}
      disabled={props.inputProps.disabled}
      error={props.error}
      onChange={(nextValue) => props.inputProps.onValueChange?.(nextValue)}
      placeholder={uiConfig.placeholder}
      scopes={scopes}
      testId={testIds.control}
      value={value}
    />
  );
}

export { SecretSelectorFieldComponent };

export const secretSelectorFieldDefinition: FieldTypeDefinition = {
  name: 'secretSelector',
  priority: 25,
  match: (_field, context) => context.inputType === 'secretSelector',
  component: SecretSelectorFieldComponent,
};
