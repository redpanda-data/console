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

import { useListUsersQuery } from '../../../../../react-query/api/user';
import { SingleSelect } from '../../../../misc/select';
import { FormItem, FormLabel, FormMessage } from '../../../../redpanda-ui/components/form';

type UserDropdownProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  errorMessage?: string;
  helperText?: string;
  isDisabled?: boolean;
};

export const UserDropdown = ({
  label,
  value,
  onChange,
  isRequired = false,
  errorMessage,
  helperText,
  isDisabled = false,
}: UserDropdownProps) => {
  const { data: usersData, isLoading } = useListUsersQuery();

  const userOptions =
    usersData?.users?.map((user) => ({
      value: user.name,
      label: user.name,
    })) || [];

  return (
    <FormItem>
      <FormLabel className="font-medium">
        {label}
        {isRequired && <span className="ml-1 text-destructive">*</span>}
      </FormLabel>
      {helperText && <p className="mb-2 text-muted-foreground text-sm">{helperText}</p>}
      <SingleSelect
        isDisabled={isDisabled}
        isLoading={isLoading}
        onChange={onChange}
        options={userOptions}
        placeholder={isLoading ? 'Loading users...' : 'Select a user...'}
        value={value}
      />
      {errorMessage && <FormMessage>{errorMessage}</FormMessage>}
    </FormItem>
  );
};
