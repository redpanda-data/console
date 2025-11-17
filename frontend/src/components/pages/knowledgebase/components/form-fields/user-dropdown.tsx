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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { useListUsersQuery } from 'react-query/api/user';

/**
 * UserDropdown component for selecting users
 */
export type UserDropdownProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  errorMessage?: string;
  helperText?: string;
};

export const UserDropdown: React.FC<UserDropdownProps> = ({
  label,
  value,
  onChange,
  isRequired = false,
  errorMessage,
  helperText,
}) => {
  const { data: usersData, isLoading } = useListUsersQuery();

  return (
    <FormItem>
      <FormLabel required={isRequired}>{label}</FormLabel>
      {helperText && <FormDescription>{helperText}</FormDescription>}
      <Select disabled={isLoading} onValueChange={onChange} value={value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? 'Loading users...' : 'Select a user...'} />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {usersData?.users?.map((user) => (
            <SelectItem key={user.name} value={user.name}>
              {user.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errorMessage && <FormMessage>{errorMessage}</FormMessage>}
    </FormItem>
  );
};
