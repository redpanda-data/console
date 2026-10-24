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

import { useNavigate } from '@tanstack/react-router';
import { InfoIcon, RotateCwIcon } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { generatePassword } from 'utils/password';

import { useListRolesQuery } from '../../../../react-query/api/security';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { setPageHeader } from '../../../../state/ui-state';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SASL_MECHANISMS, type SaslMechanism } from '../../../../utils/user';
import { Alert, AlertDescription } from '../../../redpanda-ui/components/alert';
import { Button } from '../../../redpanda-ui/components/button';
import { Checkbox } from '../../../redpanda-ui/components/checkbox';
import { CopyButton } from '../../../redpanda-ui/components/copy-button';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../../redpanda-ui/components/field';
import { Input } from '../../../redpanda-ui/components/input';
import { SimpleMultiSelect } from '../../../redpanda-ui/components/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../redpanda-ui/components/select';
import { Spinner } from '../../../redpanda-ui/components/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { useCreateUserForm } from '../hooks/use-create-user-form';

const UserCreatePage = () => {
  const [step, setStep] = useState<'CREATE_USER' | 'CREATE_USER_CONFIRMATION'>('CREATE_USER');
  const { state, isSubmitting, createUser } = useCreateUserForm(() => setStep('CREATE_USER_CONFIRMATION'));
  const navigate = useNavigate();

  useLayoutEffect(() => {
    setPageHeader('Users', [
      { title: 'Security', linkTo: '/security' },
      { title: 'Users', linkTo: '/security/users' },
    ]);
  }, []);

  const onCancel = () => navigate({ to: '/security/users' });

  return (
    <div>
      <h2 className="pt-4 pb-3 text-heading-lg font-semibold">Create user</h2>
      <div>
        {step === 'CREATE_USER' ? (
          <>
            <CreateUserModal state={state} />
            <div className="mt-8 flex gap-4">
              <CreateUserButton
                isSubmitting={isSubmitting}
                isValidPassword={state.isValidPassword}
                isValidUsername={state.isValidUsername}
                onClick={createUser}
                userExists={state.users.includes(state.username)}
                usernameEmpty={!state.username}
              />
              <Button disabled={isSubmitting} onClick={onCancel} testId="create-user-cancel" variant="link">
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <CreateUserConfirmationModal
            closeModal={onCancel}
            mechanism={state.mechanism}
            onGoToUserDetails={() => navigate({ to: `/security/users/${state.username}/details` })}
            password={state.password}
            username={state.username}
          />
        )}
      </div>
    </div>
  );
};

export default UserCreatePage;

type CreateUserButtonProps = {
  isSubmitting: boolean;
  isValidUsername: boolean;
  isValidPassword: boolean;
  userExists: boolean;
  usernameEmpty: boolean;
  onClick: () => void;
};

const getCreateUserDisabledReason = ({
  isSubmitting,
  isValidUsername,
  isValidPassword,
  userExists,
  usernameEmpty,
}: Omit<CreateUserButtonProps, 'onClick'>) => {
  if (isSubmitting) {
    return null;
  }
  const reasons: [applies: boolean, reason: string][] = [
    [usernameEmpty, 'Enter a username to continue'],
    [userExists, 'This username already exists'],
    [!isValidUsername, 'Fix the username to continue'],
    [!isValidPassword, `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`],
  ];
  return reasons.find(([applies]) => applies)?.[1] ?? null;
};

export const CreateUserButton = ({
  isSubmitting,
  isValidUsername,
  isValidPassword,
  userExists,
  usernameEmpty,
  onClick,
}: CreateUserButtonProps) => {
  const disabledReason = getCreateUserDisabledReason({
    isSubmitting,
    isValidUsername,
    isValidPassword,
    userExists,
    usernameEmpty,
  });
  const isDisabled = isSubmitting || !isValidUsername || !isValidPassword || userExists;

  const button = (
    <Button disabled={isDisabled} onClick={onClick} testId="create-user-submit">
      {isSubmitting ? <Spinner aria-hidden="true" /> : null}
      {isSubmitting ? 'Creating...' : 'Create'}
    </Button>
  );

  if (!disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-not-allowed">{button}</span>} />
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
};

export type CreateUserModalState = {
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
  selectedRoles: string[];
  setSelectedRoles: (v: string[]) => void;
};

type CreateUserModalProps = {
  state: CreateUserModalState;
};

export const CreateUserModal = ({ state }: CreateUserModalProps) => {
  const rolesApiEnabled = useSupportedFeaturesStore((s) => s.rolesApi);
  const userAlreadyExists = state.users.includes(state.username);
  const hasError = (!state.isValidUsername || userAlreadyExists) && state.username.length > 0;

  function getErrorText(): string | undefined {
    if (!state.isValidUsername) {
      return 'The username contains invalid characters. Use only letters, numbers, dots, underscores, at symbols, and hyphens.';
    }
    if (userAlreadyExists) {
      return 'User already exists';
    }
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

        <Field data-invalid={(!state.isValidPassword && state.password.length > 0) || undefined}>
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
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Refresh"
                      data-testid="refresh-password-button"
                      onClick={() => state.setPassword(generatePassword(30, state.generateWithSpecialChars))}
                      size="icon"
                      variant="ghost"
                    >
                      <RotateCwIcon size={16} />
                    </Button>
                  }
                />
                <TooltipContent side="top">Generate new random password</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <CopyButton
                      content={state.password}
                      data-testid="copy-password-button"
                      size="icon"
                      variant="ghost"
                    />
                  }
                />
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
              <label className="cursor-pointer text-body" htmlFor="special-chars">
                Generate with special characters
              </label>
            </div>
          </div>
          <FieldDescription>
            Must be at least {PASSWORD_MIN_LENGTH} characters and should not exceed {PASSWORD_MAX_LENGTH} characters.
          </FieldDescription>
          {!state.isValidPassword && state.password.length > 0 && (
            <FieldError>
              Must be at least {PASSWORD_MIN_LENGTH} characters and should not exceed {PASSWORD_MAX_LENGTH} characters.
            </FieldError>
          )}
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
      {rolesApiEnabled && (
        <div className="mt-6">
          <div className="mb-2 text-label font-medium">Assign roles</div>
          <StateRoleSelector roles={state.selectedRoles} setRoles={state.setSelectedRoles} />
        </div>
      )}
    </div>
  );
};

type CreateUserConfirmationModalProps = {
  username: string;
  password: string;
  mechanism: SaslMechanism;
  closeModal: () => void;
  onGoToUserDetails: () => void;
};

export const CreateUserConfirmationModal = ({
  username,
  password,
  mechanism,
  closeModal,
  onGoToUserDetails,
}: CreateUserConfirmationModalProps) => (
  <>
    <h1 className="mt-4 mb-8 text-heading-xl font-semibold" data-testid="user-created-successfully">
      User created
    </h1>

    <Alert className="my-2" icon={<InfoIcon />} variant="informative">
      <AlertDescription>
        You will not be able to view this password again. Make sure that it is copied and saved.
      </AlertDescription>
    </Alert>

    <div className="grid max-w-[460px] items-center gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'max-content 1fr' }}>
      <div className="font-bold" data-testid="username">
        Username
      </div>
      <div className="flex items-center gap-2">
        <Input containerClassName="flex-1" readOnly type="text" value={username} />
        <Tooltip>
          <TooltipTrigger render={<CopyButton content={username} variant="ghost" />} />
          <TooltipContent side="top">Copy username</TooltipContent>
        </Tooltip>
      </div>

      <div className="font-bold" data-testid="password">
        Password
      </div>
      <div className="flex items-center gap-2">
        <Input readOnly testId="test_field" type="password" value={password} />
        <Tooltip>
          <TooltipTrigger render={<CopyButton content={password} variant="ghost" />} />
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
      <h2 className="mb-2 text-body-lg font-semibold">Assign new user permissions</h2>
      <p className="my-3 text-body text-muted-foreground">
        To grant access to clusters, assign a role to the user or create ACLs.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={onGoToUserDetails} testId="go-to-user-details-button" variant="outline">
          Add permissions
        </Button>
        <Button onClick={closeModal} testId="done-button" variant="link">
          Done
        </Button>
      </div>
    </div>
  </>
);

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
