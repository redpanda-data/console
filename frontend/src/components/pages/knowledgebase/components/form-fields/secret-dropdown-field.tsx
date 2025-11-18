/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { AiOutlinePlus } from 'react-icons/ai';

import { rpcnSecretManagerApi } from '../../../../../state/backend-api';
import { SingleSelect } from '../../../../misc/select';
import { FormItem, FormLabel, FormMessage } from '../../../../redpanda-ui/components/form';

const CREATE_NEW_OPTION_VALUE = 'CREATE_NEW_OPTION_VALUE';

type SecretDropdownFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onCreateNew: () => void;
  isRequired?: boolean;
  errorMessage?: string;
  helperText?: string;
};

export const SecretDropdownField = ({
  label,
  value,
  onChange,
  placeholder,
  onCreateNew,
  isRequired = false,
  errorMessage,
  helperText,
}: SecretDropdownFieldProps) => {
  const availableSecrets = rpcnSecretManagerApi.secrets || [];

  const secretOptions = availableSecrets.map((secret) => ({
    value: `\${secrets.${secret.id}}`,
    label: secret.id,
  }));

  const CREATE_NEW_OPTION = {
    value: CREATE_NEW_OPTION_VALUE,
    label: (
      <div className="flex items-center gap-1">
        <AiOutlinePlus />
        <span className="font-semibold">Create New</span>
      </div>
    ),
  };

  const allOptions = [...secretOptions, CREATE_NEW_OPTION];

  const handleChange = (selectedValue: string) => {
    if (selectedValue === CREATE_NEW_OPTION_VALUE) {
      onCreateNew();
    } else {
      onChange(selectedValue);
    }
  };

  return (
    <FormItem>
      <FormLabel className="font-medium">
        {label}
        {isRequired && <span className="ml-1 text-destructive">*</span>}
      </FormLabel>
      {helperText && <p className="mb-2 text-muted-foreground text-sm">{helperText}</p>}
      <SingleSelect
        onChange={handleChange}
        options={allOptions}
        placeholder={placeholder || 'Select a secret...'}
        value={value}
      />
      {errorMessage && <FormMessage>{errorMessage}</FormMessage>}
    </FormItem>
  );
};
