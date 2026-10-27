import { create } from '@bufbuild/protobuf';
import { UpdateRoleMembershipRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { CreateUserRequest_UserSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useState } from 'react';
import { generatePassword } from 'utils/password';

import { useUpdateRoleMembershipMutation } from '../../../../react-query/api/security';
import { getSASLMechanism, useCreateUserMutation, useListUsersQuery } from '../../../../react-query/api/user';
import { type SaslMechanism, validatePassword, validateUsername } from '../../../../utils/user';
import type { CreateUserModalState } from '../users/user-create';

type CreateUserFormState = {
  username: string;
  password: string;
  mechanism: SaslMechanism;
  generateWithSpecialChars: boolean;
  selectedRoles: string[];
};

const getInitialFormState = (): CreateUserFormState => ({
  username: '',
  password: generatePassword(30, false),
  mechanism: 'SCRAM-SHA-256',
  generateWithSpecialChars: false,
  selectedRoles: [],
});

/**
 * The create-user form: its fields, the existing usernames, and `createUser`, which creates the user,
 * adds it to the selected roles (best-effort) and then calls `onCreated`.
 */
export function useCreateUserForm(onCreated: () => void) {
  const [formState, setFormState] = useState(getInitialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { mutateAsync: createUserMutate } = useCreateUserMutation();
  const { mutateAsync: updateMembership } = useUpdateRoleMembershipMutation();
  const { data: usersData } = useListUsersQuery();

  const setField =
    <K extends keyof CreateUserFormState>(key: K) =>
    (value: CreateUserFormState[K]) =>
      setFormState((prev) => ({ ...prev, [key]: value }));

  /** Creates the user, then adds it to the selected roles (best-effort); resolves to whether it was created. */
  const createUserWithRoles = async () => {
    const { username, password, mechanism, selectedRoles } = formState;
    try {
      await createUserMutate({
        user: create(CreateUserRequest_UserSchema, {
          name: username,
          password,
          mechanism: getSASLMechanism(mechanism),
        }),
      });
    } catch {
      // Toast is shown by useCreateUserMutation's onError handler.
      // mutateAsync re-throws after onError, so we catch to prevent unhandled rejection.
      return false;
    }
    await Promise.allSettled(
      selectedRoles.map((r) =>
        updateMembership(create(UpdateRoleMembershipRequestSchema, { roleName: r, add: [{ principal: username }] }))
      )
    );
    return true;
  };

  /** Resolves to whether the user was created. */
  const createUser = async (): Promise<boolean> => {
    setIsSubmitting(true);
    let created = false;
    try {
      created = await createUserWithRoles();
    } finally {
      setIsSubmitting(false);
    }
    if (created) {
      onCreated();
    }
    return created;
  };

  const state: CreateUserModalState = {
    ...formState,
    setUsername: setField('username'),
    setPassword: setField('password'),
    setMechanism: setField('mechanism'),
    setGenerateWithSpecialChars: setField('generateWithSpecialChars'),
    setSelectedRoles: setField('selectedRoles'),
    isCreating: isSubmitting,
    isValidUsername: validateUsername(formState.username),
    isValidPassword: validatePassword(formState.password),
    users: usersData?.users?.map((u) => u.name) ?? [],
  };

  return { state, isSubmitting, createUser };
}
