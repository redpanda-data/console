import { useState } from 'react';

import { useListUsersQuery } from '../../../../react-query/api/user';

/**
 * The principal type and name picked in two separate inputs, combined into `Type:name` by the caller,
 * plus the SASL-SCRAM users offered as names. Users load only while `loadUsers` is set.
 */
export function usePrincipalPicker(loadUsers: boolean) {
  const [principalType, setPrincipalType] = useState<'User' | 'Group'>('User');
  const [principalValue, setPrincipalValue] = useState('');
  const { data: usersData } = useListUsersQuery(undefined, { enabled: loadUsers });

  const reset = () => {
    setPrincipalType('User');
    setPrincipalValue('');
  };

  return {
    principalType,
    setPrincipalType,
    principalValue,
    setPrincipalValue,
    userOptions: (usersData?.users ?? []).map((u) => ({ value: u.name, label: u.name })),
    reset,
  };
}
