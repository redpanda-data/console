'use client';

// Copyright 2026 Redpanda Data, Inc.

import type React from 'react';
import { createContext, useContext } from 'react';
import { Input } from '../../input';
import { getProtoFieldCustomData } from '../../../lib/protobuf-provider';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { resolveSecretScopes } from './secret-selector-scopes';
import { useFieldTestIds } from './use-field-test-ids';

export interface SecretSelectorAdapterProps {
  description?: string | undefined;
  disabled?: boolean | undefined;
  error?: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  scopes: readonly unknown[];
  testId?: string | undefined;
  value: string;
}

export type SecretSelectorAdapter = React.ComponentType<SecretSelectorAdapterProps>;

const SecretSelectorAdapterContext = createContext<SecretSelectorAdapter | null>(null);

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

  if (Adapter === null) {
    return (
      <Input
        aria-invalid={Boolean(props.error)}
        data-testid={testIds.control}
        disabled={props.inputProps.disabled}
        onChange={(event) => {
          props.inputProps.onValueChange(event.target.value);
        }}
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
      onChange={(nextValue) => {
        props.inputProps.onValueChange(nextValue);
      }}
      placeholder={uiConfig.placeholder}
      scopes={scopes}
      testId={testIds.control}
      value={value}
    />
  );
}

export { SecretSelectorFieldComponent };
