/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { useNavigate } from '@tanstack/react-router';
import { InfoIcon, LoaderCircleIcon, RotateCwIcon } from 'lucide-react';
import { UpdateRoleMembershipRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { CreateUserRequest_UserSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useCallback, useState } from 'react';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { generatePassword } from 'utils/password';

import { useListRolesQuery, useUpdateRoleMembershipMutation } from '../../../../react-query/api/security';
import { getSASLMechanism, useCreateUserMutation, useListUsersQuery } from '../../../../react-query/api/user';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SASL_MECHANISMS,
  type SaslMechanism,
  validatePassword,
  validateUsername,
} from '../../../../utils/user';
import { Alert, AlertDescription } from '../../../redpanda-ui/components/alert';
import { Button } from '../../../redpanda-ui/components/button';
import { Checkbox } from '../../../redpanda-ui/components/checkbox';
import { CopyButton } from '../../../redpanda-ui/components/copy-button';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../../redpanda-ui/components/field';
import { Input } from '../../../redpanda-ui/components/input';
import { SimpleMultiSelect } from '../../../redpanda-ui/components/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../redpanda-ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';

const UserCreatePage = () => {
  const [formState, setFormState] = useState({
    username: '',
    password: generatePassword(30, false),
    mechanism: 'SCRAM-SHA-256' as SaslMechanism,
    generateWithSpecialChars: false,
    selectedRoles: [] as string[],
  });
  const [step, setStep] = useState<'CREATE_USER' | 'CREATE_USER_CONFIRMATION'>('CREATE_USER');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { mutateAsync: createUserMutate } = useCreateUserMutation();
  const { mutateAsync: updateMembership } = useUpdateRoleMembershipMutation();

  const { username, password, mechanism, generateWithSpecialChars, selectedRoles } = formState;
  const setUsername = (v: string) => setFormState((prev) => ({ ...prev, username: v }));
  const setPassword = (v: string) => setFormState((prev) => ({ ...prev, password: v }));
  const setMechanism = (v: SaslMechanism) => setFormState((prev) => ({ ...prev, mechanism: v }));
  const setGenerateWithSpecialChars = (v: boolean) =>
    setFormState((prev) => ({ ...prev, generateWithSpecialChars: v }));
  const setSelectedRoles = (v: string[]) => setFormState((prev) => ({ ...prev, selectedRoles: v }));

  const { data: usersData } = useListUsersQuery();
  const users = usersData?.users?.map((u) => u.name) ?? [];

  const isValidUsername = validateUsername(username);
  const isValidPassword = validatePassword(password);

  useSecurityBreadcrumbs([{ title: 'Users', linkTo: '/security/users' }]);

  const onCreateUser = useCallback(async (): Promise<boolean> => {
    setIsSubmitting(true);
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
      setIsSubmitting(false);
      return false;
    }

    const roleAddPromises = selectedRoles.map((r) =>
      updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName: r,
          add: [{ principal: username }],
        })
      )
    );

    await Promise.allSettled(roleAddPromises);
    setIsSubmitting(false);
    setStep('CREATE_USER_CONFIRMATION');
    return true;
  }, [username, password, mechanism, selectedRoles, createUserMutate, updateMembership]);

  const navigate = useNavigate();
  const onCancel = () => navigate({ to: '/security/users' });
  const onCreateAcls = () =>
    navigate({
      to: '/security/acls/create',
      search: { principalType: 'User', principalName: username },
    });

  const state = {
    username,
    setUsername,
    password,
    setPassword,
    mechanism,
    setMechanism,
    generateWithSpecialChars,
    setGenerateWithSpecialChars,
    isCreating: isSubmitting,
    isValidUsername,
    isValidPassword,
    selectedRoles,
    setSelectedRoles,
    users,
  };

  return (
    <div>
      <h2 className="pt-4 pb-3 font-semibold text-xl">Create user</h2>
      <div>
        {step === 'CREATE_USER' ? (
          <CreateUserModal onCancel={onCancel} onCreateUser={onCreateUser} state={state} />
        ) : (
          <CreateUserConfirmationModal
            closeModal={onCancel}
            mechanism={mechanism}
            onCreateAcls={onCreateAcls}
            password={password}
            username={username}
          />
        )}
      </div>
    </div>
  );
};

export default UserCreatePage;

type CreateUserModalProps = {
  state: {
    username: string;
    setUsername: (v: string) => void;
    password: string;
    setPassword: (v: string) => void;
    mechanism: SaslMechanism;
    setMechanism: (v: SaslMechanism) => void;
    generateWithSpecialChars: boolean;
    setGenerateWithSpecialChars: (v: boolean) => void;
    isCreating: boolean;
    isValidUsername: boolean;
    isValidPassword: boolean;
    users: string[];
  };
  onCreateUser: () => Promise<boolean>;
  onCancel: () => void;
};

export const CreateUserModal = ({ state, onCreateUser, onCancel }: CreateUserModalProps) => {
  const userAlreadyExists = state.users.includes(state.username);
  const hasError = (!state.isValidUsername || userAlreadyExists) && state.username.length > 0;

  function getErrorText(): string | undefined {
    if (!state.isValidUsername) {
      return 'The username contains invalid characters. Use only letters, numbers, dots, underscores, at symbols, and hyphens.';
    }
    if (userAlreadyExists) {
      return 'User already exists';
    }
    return;
  }
  const errorText = getErrorText();

  return (
    <div className="max-w-[460px]">
      <div className="flex flex-col gap-8">
        <Field data-invalid={hasError || undefined}>
          <FieldLabel htmlFor="create-user-name" required>
            Username
          </FieldLabel>
          <Input
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            id="create-user-name"
            onChange={(e) => state.setUsername(e.target.value)}
            placeholder="Username"
            spellCheck={false}
            testId="create-user-name"
            value={state.username}
          />
          <FieldDescription>
            Must not contain any whitespace. Dots, hyphens and underscores may be used.
          </FieldDescription>
          {hasError && errorText !== undefined && <FieldError>{errorText}</FieldError>}
        </Field>

        <Field>
          <FieldLabel required>Password</FieldLabel>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                aria-invalid={!state.isValidPassword}
                name="test"
                onChange={(e) => state.setPassword(e.target.value)}
                testId="create-user-password"
                type="password"
                value={state.password}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Refresh"
                    data-testid="refresh-password-button"
                    onClick={() => state.setPassword(generatePassword(30, state.generateWithSpecialChars))}
                    size="icon"
                    variant="ghost"
                  >
                    <RotateCwIcon size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Generate new random password</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CopyButton content={state.password} data-testid="copy-password-button" variant="ghost" />
                </TooltipTrigger>
                <TooltipContent side="top">Copy password</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={state.generateWithSpecialChars}
                id="special-chars"
                onCheckedChange={(checked) => {
                  const val = checked === true;
                  state.setGenerateWithSpecialChars(val);
                  state.setPassword(generatePassword(30, val));
                }}
                testId="special-chars-checkbox"
              />
              <label className="cursor-pointer text-sm" htmlFor="special-chars">
                Generate with special characters
              </label>
            </div>
          </div>
          <FieldDescription>
            Must be at least {PASSWORD_MIN_LENGTH} characters and should not exceed {PASSWORD_MAX_LENGTH} characters.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel required>SASL mechanism</FieldLabel>
          <Select onValueChange={(v) => state.setMechanism(v as SaslMechanism)} value={state.mechanism}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SASL_MECHANISMS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="mt-8 flex gap-4">
        <Button
          disabled={state.isCreating || !state.isValidUsername || !state.isValidPassword || userAlreadyExists}
          onClick={onCreateUser}
          testId="create-user-submit"
        >
          {state.isCreating ? <LoaderCircleIcon className="animate-spin" size={16} /> : null}
          {state.isCreating ? 'Creating...' : 'Create'}
        </Button>
        <Button disabled={state.isCreating} onClick={onCancel} testId="create-user-cancel" variant="link">
          Cancel
        </Button>
      </div>
    </div>
  );
};

type CreateUserConfirmationModalProps = {
  username: string;
  password: string;
  mechanism: SaslMechanism;
  closeModal: () => void;
  onCreateAcls: () => void;
  onAssignRoles?: () => void;
};

export const CreateUserConfirmationModal = ({
  username,
  password,
  mechanism,
  closeModal,
  onCreateAcls,
  onAssignRoles,
}: CreateUserConfirmationModalProps) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);

  return (
    <>
      <h1 className="mt-4 mb-8 font-semibold text-2xl" data-testid="user-created-successfully">
        User created successfully
      </h1>

      <Alert className="my-2" icon={<InfoIcon />} variant="info">
        <AlertDescription>
          You will not be able to view this password again. Make sure that it is copied and saved.
        </AlertDescription>
      </Alert>

      <div
        className="grid max-w-[460px] items-center gap-x-6 gap-y-2"
        style={{ gridTemplateColumns: 'max-content 1fr' }}
      >
        <div className="font-bold" data-testid="username">
          Username
        </div>
        <div className="flex items-center gap-2">
          <span className="overflow-hidden break-all">{username}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <CopyButton content={username} variant="ghost" />
            </TooltipTrigger>
            <TooltipContent side="top">Copy username</TooltipContent>
          </Tooltip>
        </div>

        <div className="font-bold" data-testid="password">
          Password
        </div>
        <div className="flex items-center gap-2">
          <Input disabled readOnly testId="test_field" type="password" value={password} />
          <Tooltip>
            <TooltipTrigger asChild>
              <CopyButton content={password} variant="ghost" />
            </TooltipTrigger>
            <TooltipContent side="top">Copy password</TooltipContent>
          </Tooltip>
        </div>

        <div className="font-bold" data-testid="mechanism">
          Mechanism
        </div>
        <div>
          <span className="truncate">{mechanism}</span>
        </div>
      </div>

      <div className="mt-3 border-t pt-6">
        <h2 className="mb-2 font-semibold text-base">What's next?</h2>
        <p className="my-3 text-muted-foreground text-sm">
          This user has no permissions yet. Assign roles or create ACLs to grant access to cluster resources.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={onCreateAcls} testId="create-acls-button" variant="outline">
            Create ACLs
          </Button>
          {featureRolesApi && onAssignRoles && (
            <Button onClick={onAssignRoles} testId="assign-roles-button" variant="outline">
              Assign Roles
            </Button>
          )}
          <Button onClick={closeModal} testId="done-button" variant="link">
            Done
          </Button>
        </div>
      </div>
    </>
  );
};

export const StateRoleSelector = ({ roles, setRoles }: { roles: string[]; setRoles: (roles: string[]) => void }) => {
  const {
    data: { roles: allRoles },
  } = useListRolesQuery();
  const availableRoles = (allRoles ?? [])
    .filter((r: { name: string }) => !roles.includes(r.name))
    .map((r: { name: string }) => r.name);

  return (
    <div className="w-[280px]">
      <SimpleMultiSelect
        onValueChange={setRoles}
        options={availableRoles}
        placeholder="Select roles..."
        value={roles}
        width="full"
      />
    </div>
  );
};
