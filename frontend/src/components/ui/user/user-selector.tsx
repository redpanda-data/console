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

import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';

import { useListUsersQuery } from '../../../react-query/api/user';

type UserSelectorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  errorMessage?: string;
  helperText?: string;
  isDisabled?: boolean;
};

export const UserSelector = ({
  label,
  value,
  onChange,
  isRequired = false,
  errorMessage,
  helperText,
  isDisabled = false,
}: UserSelectorProps) => {
  const { data: usersData, isLoading } = useListUsersQuery();

  const users = usersData?.users || [];

  return (
    <Field data-invalid={!!errorMessage}>
      <FieldLabel required={isRequired}>{label}</FieldLabel>
      {helperText && <FieldDescription>{helperText}</FieldDescription>}
      <Select disabled={isDisabled || isLoading} onValueChange={onChange} value={value}>
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? 'Loading users...' : 'Select a user...'} />
        </SelectTrigger>
        <SelectContent>
          {users.length > 0 ? (
            users.map((user) => (
              <SelectItem key={user.name} value={user.name}>
                {user.name}
              </SelectItem>
            ))
          ) : (
            <div className="px-2 py-6 text-center text-sm">
              <Text variant="muted">{isLoading ? 'Loading...' : 'No users found'}</Text>
            </div>
          )}
        </SelectContent>
      </Select>
      {errorMessage && <FieldError>{errorMessage}</FieldError>}
    </Field>
  );
};
