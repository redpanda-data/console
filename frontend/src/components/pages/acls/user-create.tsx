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
import { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, RotateCwIcon } from 'lucide-react';
import { UpdateRoleMembershipRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { CreateUserRequestSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useListRolesQuery, useUpdateRoleMembershipMutation } from 'react-query/api/security';
import { getSASLMechanism, useCreateUserMutation, useLegacyListUsersQuery } from 'react-query/api/user';
import { toast } from 'sonner';
import { Features } from 'state/supported-features';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import {
  generatePassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SASL_MECHANISMS,
  type SaslMechanism,
  USERNAME_MAX_LENGTH,
} from 'utils/user';

import { createUserFormSchema, initialValues, type UserCreateFormValues } from './user-create-form-schema';
import PageContent from '../../misc/page-content';
import { Button } from '../../redpanda-ui/components/button';
import { Checkbox } from '../../redpanda-ui/components/checkbox';
import { CopyButton } from '../../redpanda-ui/components/copy-button';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../redpanda-ui/components/field';
import { Input } from '../../redpanda-ui/components/input';
import { Label } from '../../redpanda-ui/components/label';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from '../../redpanda-ui/components/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../redpanda-ui/components/tooltip';
import { Heading, Text } from '../../redpanda-ui/components/typography';

type SubmittedData = {
  username: string;
  password: string;
  mechanism: SaslMechanism;
};

const UserCreatePage = () => {
  const navigate = useNavigate();
  const [submittedData, setSubmittedData] = useState<SubmittedData | null>(null);
  const [generateWithSpecialChars, setGenerateWithSpecialChars] = useState(false);

  const { data: usersData } = useLegacyListUsersQuery();
  const existingUsers = useMemo(() => usersData?.users?.map((u) => u.name) ?? [], [usersData]);

  const { mutateAsync: createUser, isPending: isCreating } = useCreateUserMutation();
  const { mutateAsync: updateRoleMembership } = useUpdateRoleMembershipMutation();

  const form = useForm<UserCreateFormValues>({
    resolver: zodResolver(createUserFormSchema(existingUsers)),
    defaultValues: {
      ...initialValues,
      password: generatePassword(30, false),
    },
    mode: 'onChange',
  });

  useEffect(() => {
    uiState.pageTitle = 'Create user';
    uiState.pageBreadcrumbs = [];
    uiState.pageBreadcrumbs.push({ title: 'Access Control', linkTo: '/security' });
    uiState.pageBreadcrumbs.push({ title: 'Create user', linkTo: '/security/users/create' });
  }, []);

  const onSubmit = async (values: UserCreateFormValues) => {
    try {
      const request = create(CreateUserRequestSchema, {
        user: {
          name: values.username,
          password: values.password,
          mechanism: getSASLMechanism(values.mechanism),
        },
      });
      await createUser(request);

      // Assign roles
      const rolePromises = values.roles.map((roleName) => {
        const membership = create(UpdateRoleMembershipRequestSchema, {
          roleName,
          add: [{ principal: values.username }],
        });
        return updateRoleMembership(membership);
      });
      await Promise.allSettled(rolePromises);

      setSubmittedData({
        username: values.username,
        password: values.password,
        mechanism: values.mechanism,
      });
    } catch (error) {
      const connectError = ConnectError.from(error);
      toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'create', entity: 'user' }));
    }
  };

  const onCancel = () => navigate({ to: '/security/$tab', params: { tab: 'users' } });

  if (submittedData) {
    return (
      <PageContent>
        <CreateUserConfirmation
          mechanism={submittedData.mechanism}
          onDone={onCancel}
          password={submittedData.password}
          username={submittedData.username}
        />
      </PageContent>
    );
  }

  return (
    <PageContent>
      <form className="flex max-w-[460px] flex-col gap-8" onSubmit={form.handleSubmit(onSubmit)}>
        <Controller
          control={form.control}
          name="username"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>Username</FieldLabel>
              <Input
                {...field}
                autoComplete="off"
                autoFocus
                placeholder="Username"
                spellCheck={false}
                testId="create-user-name"
              />
              <FieldDescription>
                Must not contain any whitespace. Dots, hyphens and underscores may be used. Maximum{' '}
                {USERNAME_MAX_LENGTH} characters.
              </FieldDescription>
              {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} data-testid="create-user-password">
              <FieldLabel required>Password</FieldLabel>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input {...field} type="password" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Generate new random password"
                        onClick={() =>
                          form.setValue('password', generatePassword(30, generateWithSpecialChars), {
                            shouldValidate: true,
                          })
                        }
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <RotateCwIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Generate new random password</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CopyButton content={field.value} size="icon" variant="ghost" />
                    </TooltipTrigger>
                    <TooltipContent>Copy password</TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={generateWithSpecialChars}
                    id="special-chars"
                    onCheckedChange={(checked) => {
                      const useSpecial = checked === true;
                      setGenerateWithSpecialChars(useSpecial);
                      form.setValue('password', generatePassword(30, useSpecial), { shouldValidate: true });
                    }}
                  />
                  <Label htmlFor="special-chars">Generate with special characters</Label>
                </div>
              </div>
              <FieldDescription>
                Must be at least {PASSWORD_MIN_LENGTH} characters and should not exceed {PASSWORD_MAX_LENGTH}{' '}
                characters.
              </FieldDescription>
              {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="mechanism"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>SASL mechanism</FieldLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SASL_MECHANISMS.map((mechanism) => (
                    <SelectItem key={mechanism} value={mechanism}>
                      {mechanism}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {Boolean(Features.rolesApi) && (
          <Controller
            control={form.control}
            name="roles"
            render={({ field }) => (
              <Field>
                <FieldLabel>Assign roles</FieldLabel>
                <StateRoleSelector roles={field.value} setRoles={field.onChange} />
                <FieldDescription>
                  Assign roles to this user. This is optional and can be changed later.
                </FieldDescription>
              </Field>
            )}
          />
        )}

        <div className="flex gap-4">
          <Button data-testid="create-user-submit" disabled={!form.formState.isValid || isCreating} type="submit">
            {isCreating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create'
            )}
          </Button>
          <Button disabled={isCreating} onClick={onCancel} type="button" variant="secondary-ghost">
            Cancel
          </Button>
        </div>
      </form>
    </PageContent>
  );
};

export default UserCreatePage;

type CreateUserConfirmationProps = {
  username: string;
  password: string;
  mechanism: SaslMechanism;
  onDone: () => void;
};

const CreateUserConfirmation = ({ username, password, mechanism, onDone }: CreateUserConfirmationProps) => (
  <div className="flex max-w-[460px] flex-col gap-6">
    <Heading level={1}>User created successfully</Heading>

    <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950">
      <Text>You will not be able to view this password again. Make sure that it is copied and saved.</Text>
    </div>

    <div className="grid max-w-[460px] grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-2">
      <Text data-testid="username" variant="label">
        Username
      </Text>
      <div className="flex items-center gap-2">
        <Text className="overflow-hidden break-all">{username}</Text>
        <Tooltip>
          <TooltipTrigger asChild>
            <CopyButton content={username} size="icon" variant="ghost" />
          </TooltipTrigger>
          <TooltipContent>Copy username</TooltipContent>
        </Tooltip>
      </div>

      <Text data-testid="password" variant="label">
        Password
      </Text>
      <div className="flex items-center gap-2">
        <Input disabled readOnly type="password" value={password} />
        <Tooltip>
          <TooltipTrigger asChild>
            <CopyButton content={password} size="icon" variant="ghost" />
          </TooltipTrigger>
          <TooltipContent>Copy password</TooltipContent>
        </Tooltip>
      </div>

      <Text data-testid="mechanism" variant="label">
        Mechanism
      </Text>
      <Text className="truncate">{mechanism}</Text>
    </div>

    <div className="flex gap-4">
      <Button onClick={onDone}>Done</Button>
      <Button asChild variant="secondary-ghost">
        <Link search={{ principalName: username, principalType: 'User' }} to="/security/acls/create">
          Create ACLs
        </Link>
      </Button>
    </div>
  </div>
);

/**
 * Role selector using MultiSelect.
 * Exported for use in user-edit-modals.tsx.
 */
export const StateRoleSelector = ({ roles, setRoles }: { roles: string[]; setRoles: (roles: string[]) => void }) => {
  const {
    data: { roles: allRoles },
  } = useListRolesQuery();

  const availableOptions = useMemo(
    () => (allRoles ?? []).map((r: { name: string }) => ({ value: r.name, label: r.name })),
    [allRoles]
  );

  return (
    <div className="w-[280px]">
      <MultiSelect onValueChange={setRoles} value={roles}>
        <MultiSelectTrigger>
          <MultiSelectValue placeholder="Select roles..." />
        </MultiSelectTrigger>
        <MultiSelectContent>
          <MultiSelectList>
            {availableOptions.map((option) => (
              <MultiSelectItem key={option.value} value={option.value}>
                {option.label}
              </MultiSelectItem>
            ))}
          </MultiSelectList>
          <MultiSelectEmpty>No roles found</MultiSelectEmpty>
        </MultiSelectContent>
      </MultiSelect>
    </div>
  );
};
