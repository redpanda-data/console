/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { SecretSelector } from 'components/ui/secret/secret-selector';
import type { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';

// Regex pattern for extracting secret ID from interpolation format
const SECRET_INTERPOLATION_REGEX = /\$\{secrets\.([^}]+)\}/;

/**
 * SecretDropdownField component for selecting secrets or creating new ones
 */
export type SecretDropdownFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  availableSecrets: Array<{ id: string; name: string }>;
  placeholder?: string;
  isRequired?: boolean;
  errorMessage?: string;
  helperText?: string;
  scopes: Scope[];
  dialogTitle?: string;
  dialogDescription?: string;
  emptyStateMessage?: string;
  secretNamePlaceholder?: string;
  secretValuePlaceholder?: string;
  secretValueDescription?: string;
  secretValuePattern?: {
    regex: RegExp;
    message: string;
  };
};

export const SecretDropdownField: React.FC<SecretDropdownFieldProps> = ({
  label,
  value,
  onChange,
  availableSecrets,
  placeholder,
  isRequired = false,
  errorMessage,
  helperText,
  scopes,
  dialogTitle,
  dialogDescription,
  emptyStateMessage,
  secretNamePlaceholder,
  secretValuePlaceholder,
  secretValueDescription,
  secretValuePattern,
}) => {
  const handleSecretChange = (secretId: string) => {
    // Convert secret ID to interpolation format
    onChange(`\${secrets.${secretId}}`);
  };

  // Extract secret ID from interpolation format
  const extractedValue = value.match(SECRET_INTERPOLATION_REGEX)?.[1] || '';

  return (
    <FormItem>
      <FormLabel required={isRequired}>{label}</FormLabel>
      {helperText && <FormDescription>{helperText}</FormDescription>}
      <FormControl>
        <SecretSelector
          availableSecrets={availableSecrets}
          dialogDescription={dialogDescription}
          dialogTitle={dialogTitle}
          emptyStateMessage={emptyStateMessage}
          onChange={handleSecretChange}
          placeholder={placeholder || 'Select a secret...'}
          scopes={scopes}
          secretNamePlaceholder={secretNamePlaceholder}
          secretValueDescription={secretValueDescription}
          secretValuePattern={secretValuePattern}
          secretValuePlaceholder={secretValuePlaceholder}
          value={extractedValue}
        />
      </FormControl>
      {errorMessage && <FormMessage>{errorMessage}</FormMessage>}
    </FormItem>
  );
};
