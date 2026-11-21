import { createConnectQueryKey } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { Link as TanStackRouterLink } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Group } from 'components/redpanda-ui/components/group';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { List, ListItem } from 'components/redpanda-ui/components/typography';
import { ServiceAccountSelector } from 'components/ui/service-account/service-account-selector';
import { CircleAlert, RefreshCcw } from 'lucide-react';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { ListUsersResponse_User as User } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { type Dispatch, type SetStateAction, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { generatePassword } from 'utils/password';
import { SASL_MECHANISMS } from 'utils/user';

import type {
  AddUserStepProps,
  ExistingUserAccess,
  ServiceAccountDraft,
  UserForm,
  UserSelection,
} from './add-user-step';
import { isNonEmptyString } from '../../../../utils/string-utils';
import { AuthenticationMethod, type AuthenticationMethodType, CreatableSelectionOptions } from '../types/wizard';
import { getACLOperationName } from '../utils/user';

function usePasswordRegeneration(form: UserForm) {
  const watchedSpecialCharacters = useWatch({
    control: form.control,
    name: 'specialCharactersEnabled',
  });
  const watchedPasswordLength = useWatch({
    control: form.control,
    name: 'passwordLength',
  });

  const generateNewPassword = useCallback(() => {
    const newPassword = generatePassword(watchedPasswordLength, watchedSpecialCharacters);
    form.setValue('password', newPassword, { shouldDirty: true });
  }, [watchedPasswordLength, watchedSpecialCharacters, form]);

  const handleSpecialCharsChange = useCallback(
    (val: boolean | 'indeterminate', onChange: (value: boolean) => void) => {
      const newValue = val === 'indeterminate' ? false : val;
      onChange(newValue);
      generateNewPassword();
    },
    [generateNewPassword]
  );
  return { generateNewPassword, handleSpecialCharsChange };
}

function AuthMethodField({
  authMethod,
  onAuthMethodChange,
  disabled,
}: {
  authMethod: AuthenticationMethodType;
  onAuthMethodChange: Dispatch<SetStateAction<AuthenticationMethodType>>;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FormLabel>Authentication method</FormLabel>
      <Tabs
        onValueChange={(value) => {
          if (
            typeof value === 'string' &&
            (value === AuthenticationMethod.SASL || value === AuthenticationMethod.SERVICE_ACCOUNT)
          ) {
            onAuthMethodChange(value);
          }
        }}
        value={authMethod}
      >
        <TabsList>
          <TabsTrigger disabled={disabled} value={AuthenticationMethod.SASL}>
            SASL user
          </TabsTrigger>
          <TabsTrigger disabled={disabled} value={AuthenticationMethod.SERVICE_ACCOUNT}>
            Service account
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

function UsernameField({
  form,
  users,
  isPending,
  selectionMode,
}: {
  form: UserForm;
  users: UserSelection;
  isPending: boolean;
  selectionMode: NonNullable<AddUserStepProps['selectionMode']>;
}) {
  const queryClient = useQueryClient();
  return (
    <div className="flex items-start gap-2">
      {selectionMode === 'both' && (
        <Tabs
          className="shrink-0"
          onValueChange={(value) => {
            if (typeof value === 'string') {
              users.handleUserSelectionTypeChange(value);
            }
          }}
          value={users.userSelectionType}
        >
          {/* h-9 matches the field beside it. */}
          <TabsList className="h-9">
            <TabsTrigger disabled={isPending} value={CreatableSelectionOptions.EXISTING}>
              Existing
            </TabsTrigger>
            <TabsTrigger disabled={isPending} value={CreatableSelectionOptions.CREATE}>
              New
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <FormField
        control={form.control}
        name="username"
        render={({ field }) => (
          <FormItem className="min-w-0 flex-1">
            <FormControl>
              {users.userSelectionType === CreatableSelectionOptions.EXISTING ? (
                <Combobox
                  {...field}
                  className="w-full"
                  disabled={isPending}
                  onChange={(value) => {
                    field.onChange(value);
                  }}
                  onOpen={() => {
                    Promise.all([
                      queryClient.invalidateQueries({
                        queryKey: createConnectQueryKey({
                          schema: listUsers,
                          cardinality: 'infinite',
                        }),
                      }),
                      queryClient.invalidateQueries({
                        queryKey: createConnectQueryKey({
                          schema: listACLs,
                          cardinality: 'finite',
                        }),
                      }),
                    ]).catch((error: unknown) => {
                      toast.error('Failed to refresh users', { description: String(error) });
                    });
                  }}
                  options={users.userOptions}
                  placeholder="Select a user"
                />
              ) : (
                <Input {...field} disabled={isPending} placeholder="Enter a username" />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function PermissionList({ permissions }: { permissions: Parameters<typeof getACLOperationName>[0][] }) {
  return (
    <List>
      {permissions.map((permission) => (
        <ListItem key={permission}>{getACLOperationName(permission)}</ListItem>
      ))}
    </List>
  );
}

function ExistingUserAlerts({
  users,
  access,
  isPending,
  topicName,
}: {
  users: UserSelection;
  access: ExistingUserAccess;
  isPending: boolean;
  topicName?: string;
}) {
  const { existingUserSelected, userSelectionType, watchedUsername } = users;
  const { missingUserSecrets, userTopicPermissions, needsTopicGrant } = access;
  return (
    <>
      {existingUserSelected && userSelectionType === CreatableSelectionOptions.CREATE && !isPending && (
        <Alert variant="informative">
          <AlertDescription>
            A user named <b>{watchedUsername}</b> already exists. A reference to the existing user will be used.
          </AlertDescription>
        </Alert>
      )}

      {missingUserSecrets.length > 0 && !isPending && (
        <Alert variant="warning">
          <AlertTitle>No stored credentials for this user</AlertTitle>
          <AlertDescription>
            {missingUserSecrets.length === 1
              ? `The pipeline logs in with the ${missingUserSecrets[0]} secret, which doesn't exist yet. Create it, or create a new user here instead.`
              : `The pipeline logs in with the ${missingUserSecrets.join(' and ')} secrets, which don't exist yet. Create them, or create a new user here instead.`}
          </AlertDescription>
        </Alert>
      )}

      {existingUserSelected && userTopicPermissions && !needsTopicGrant && (
        <Alert icon={<CircleAlert />} variant="success">
          <AlertTitle>User has required permissions</AlertTitle>
          <AlertDescription>
            <div className="text-body-sm">
              The user <b>{existingUserSelected.name}</b> has the following permissions for the <b>{topicName}</b>{' '}
              topic:
              <PermissionList permissions={userTopicPermissions.hasPermissions} />
            </div>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function PasswordField({ form, isPending, isReadOnly }: { form: UserForm; isPending: boolean; isReadOnly: boolean }) {
  const { generateNewPassword, handleSpecialCharsChange } = usePasswordRegeneration(form);
  return (
    <FormField
      control={form.control}
      disabled={isPending || isReadOnly}
      name="password"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Password</FormLabel>
          <FormDescription>
            Make sure to save the password somewhere safe. It cannot be retrieved after creation.
          </FormDescription>
          <FormControl>
            <Group>
              <Input type="password" {...field} />
              <CopyButton content={field.value} disabled={isReadOnly} size="icon" variant="outline" />
              <Button
                className="[&_svg]:size-4"
                disabled={isReadOnly}
                onClick={generateNewPassword}
                size="icon"
                type="button"
                variant="outline"
              >
                <RefreshCcw size={15} />
              </Button>
            </Group>
          </FormControl>
          <FormMessage />
          <FormField
            disabled={isReadOnly}
            {...field}
            control={form.control}
            name="specialCharactersEnabled"
            render={({ field: specialCharsField }) => (
              <div className="flex flex-row items-center gap-2">
                <Checkbox
                  checked={specialCharsField.value}
                  id="specialCharactersEnabled"
                  onCheckedChange={(val) => handleSpecialCharsChange(val, specialCharsField.onChange)}
                  {...field}
                />
                <Label htmlFor="specialCharactersEnabled">Generate with special characters</Label>
              </div>
            )}
          />
        </FormItem>
      )}
    />
  );
}

function SaslMechanismField({ form, disabled }: { form: UserForm; disabled: boolean }) {
  return (
    <FormField
      control={form.control}
      disabled={disabled}
      name="saslMechanism"
      render={({ field }) => (
        <FormItem>
          <FormLabel>SASL mechanism</FormLabel>
          <FormControl>
            <Select {...field} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a SASL Mechanism" />
              </SelectTrigger>
              <SelectContent>
                {SASL_MECHANISMS.map((mechanism) => (
                  <SelectItem key={mechanism} value={mechanism}>
                    {mechanism}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function GrantTopicField({ form, isPending, topicName }: { form: UserForm; isPending: boolean; topicName?: string }) {
  return (
    <FormField
      control={form.control}
      disabled={isPending}
      name="grantTopicPermissions"
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center gap-3">
            <FormControl>
              <Checkbox checked={field.value} disabled={field.disabled} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel>Grant this user full access to {topicName}</FormLabel>
          </div>
          {field.value ? (
            // Indented past the checkbox and its gap, under the label text.
            <FormDescription className="ml-7">
              Read, write, create, delete, describe and alter permissions on the topic.
            </FormDescription>
          ) : (
            <Alert icon={<CircleAlert />} variant="destructive">
              <AlertTitle>User will not be able to read from topic</AlertTitle>
              <AlertDescription>
                <div className="text-body-sm">
                  You will need to configure{' '}
                  <TanStackRouterLink rel="noopener noreferrer" target="_blank" to="/security/permissions">
                    Permissions
                  </TanStackRouterLink>{' '}
                  for custom user permissions if you want the user to be able to read from the topic.
                </div>
              </AlertDescription>
            </Alert>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ConsumerGroupAlerts({
  existingUserSelected,
  access,
}: {
  existingUserSelected?: User;
  access: ExistingUserAccess;
}) {
  const { watchedConsumerGroup, userConsumerGroupPermissions } = access;
  return (
    <>
      {existingUserSelected &&
        isNonEmptyString(watchedConsumerGroup) &&
        userConsumerGroupPermissions &&
        userConsumerGroupPermissions.missingPermissions.length === 0 &&
        userConsumerGroupPermissions.hasPermissions.length > 0 && (
          <Alert icon={<CircleAlert />} variant="success">
            <AlertTitle>User has required consumer group permissions</AlertTitle>
            <AlertDescription>
              <div className="text-body-sm">
                The user <b>{existingUserSelected?.name}</b> has the following permissions for the{' '}
                <b>{watchedConsumerGroup}</b> consumer group:
                <PermissionList permissions={userConsumerGroupPermissions?.hasPermissions} />
              </div>
            </AlertDescription>
          </Alert>
        )}

      {isNonEmptyString(watchedConsumerGroup) &&
        watchedConsumerGroup.length > 0 &&
        (!existingUserSelected ||
          (userConsumerGroupPermissions && userConsumerGroupPermissions.missingPermissions.length > 0)) && (
          <Alert icon={<CircleAlert />} variant="warning">
            <AlertTitle>Consumer group permissions will be configured</AlertTitle>
            <AlertDescription>
              <div className="text-body-sm">
                {existingUserSelected ? (
                  <>
                    The user <b>{existingUserSelected.name}</b> will be granted READ and DESCRIBE permissions for the{' '}
                    <b>{watchedConsumerGroup}</b> consumer group.
                  </>
                ) : (
                  <>
                    This user will be able to consume messages from the <b>{watchedConsumerGroup}</b> consumer group.
                  </>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
    </>
  );
}

function ConsumerGroupField({
  form,
  isPending,
  existingUserSelected,
  access,
}: {
  form: UserForm;
  isPending: boolean;
  existingUserSelected?: User;
  access: ExistingUserAccess;
}) {
  const queryClient = useQueryClient();
  return (
    <div className="flex flex-col gap-2">
      <FormLabel>Consumer group (optional)</FormLabel>
      <FormDescription>
        The group this input reads as, so its offsets are kept between restarts. It's set on the input and the user is
        granted access to it. Leave it empty if the input reads explicit topic partitions.
      </FormDescription>
      <div className="flex flex-col gap-2">
        <FormField
          control={form.control}
          name="consumerGroup"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  disabled={isPending}
                  onFocus={() => {
                    queryClient
                      .invalidateQueries({
                        queryKey: createConnectQueryKey({
                          schema: listACLs,
                          cardinality: 'finite',
                        }),
                      })
                      .catch((error: unknown) => {
                        toast.error('Failed to refresh permissions', { description: String(error) });
                      });
                  }}
                  placeholder="Enter a consumer group name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ConsumerGroupAlerts access={access} existingUserSelected={existingUserSelected} />
      </div>
    </div>
  );
}

type SaslUserFieldsProps = {
  form: UserForm;
  users: UserSelection;
  access: ExistingUserAccess;
  isPending: boolean;
  selectionMode: NonNullable<AddUserStepProps['selectionMode']>;
  topicName?: string;
  showConsumerGroupFields: boolean;
};

function SaslUserFields({
  form,
  users,
  access,
  isPending,
  selectionMode,
  topicName,
  showConsumerGroupFields,
}: SaslUserFieldsProps) {
  const isCreating = users.userSelectionType === CreatableSelectionOptions.CREATE;
  return (
    <>
      <div className="flex flex-col gap-2">
        <FormLabel>Username</FormLabel>
        <FormDescription>Use an existing user, or create a new one.</FormDescription>
        <div className="flex flex-col gap-2">
          <UsernameField form={form} isPending={isPending} selectionMode={selectionMode} users={users} />
          <ExistingUserAlerts access={access} isPending={isPending} topicName={topicName} users={users} />
        </div>
      </div>
      {isCreating && (
        <>
          <PasswordField form={form} isPending={isPending} isReadOnly={users.isReadOnly} />
          <SaslMechanismField disabled={isPending || users.isReadOnly} form={form} />
        </>
      )}

      {Boolean(access.needsTopicGrant) && <GrantTopicField form={form} isPending={isPending} topicName={topicName} />}

      {showConsumerGroupFields && (
        <ConsumerGroupField
          access={access}
          existingUserSelected={users.existingUserSelected}
          form={form}
          isPending={isPending}
        />
      )}
    </>
  );
}

function ServiceAccountFields({
  serviceAccount,
  isPending,
}: {
  serviceAccount: ServiceAccountDraft;
  isPending: boolean;
}) {
  const { mutateAsync: createSecret } = useCreateSecretMutation();
  const {
    serviceAccountName,
    setServiceAccountName,
    serviceAccountSelectorRef,
    isServiceAccountPending,
    setIsServiceAccountPending,
  } = serviceAccount;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <FormLabel htmlFor="serviceAccountName">Service account name</FormLabel>
        <FormDescription>Auto-generated name for the service account. You can customize it if needed.</FormDescription>
        <Input
          disabled={isPending || isServiceAccountPending}
          id="serviceAccountName"
          onChange={(e) => setServiceAccountName(e.target.value)}
          placeholder="cluster-abc-pipeline-my-pipeline-sa"
          value={serviceAccountName}
        />
      </div>

      <ServiceAccountSelector
        createSecret={createSecret}
        onPendingChange={setIsServiceAccountPending}
        ref={serviceAccountSelectorRef}
        resourceType="pipeline"
        secretScopes={[Scope.REDPANDA_CONNECT]}
        serviceAccountName={serviceAccountName}
      />

      <Alert variant="warning">
        <AlertTitle>Creates a service account</AlertTitle>
        <AlertDescription>
          Adding creates it right away, with the Writer role on this cluster. It's attached to the pipeline when you
          save, and every component that logs in with a service account uses it.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ExistingServiceAccountNotice() {
  return (
    <Alert variant="informative">
      <AlertTitle>Uses this pipeline's service account</AlertTitle>
      <AlertDescription>
        This pipeline already has a service account, so this component logs in with it. No new account is created.
      </AlertDescription>
    </Alert>
  );
}

type AddUserFormBodyProps = Omit<SaslUserFieldsProps, 'isPending'> & {
  inline: boolean;
  authMethod: AuthenticationMethodType;
  onAuthMethodChange: Dispatch<SetStateAction<AuthenticationMethodType>>;
  serviceAccount: ServiceAccountDraft;
  hasServiceAccount: boolean;
  isPending: boolean;
};

export function AddUserFormBody({
  inline,
  authMethod,
  onAuthMethodChange,
  serviceAccount,
  hasServiceAccount,
  ...saslProps
}: AddUserFormBodyProps) {
  const { form, isPending } = saslProps;
  const isServiceAccount = authMethod === AuthenticationMethod.SERVICE_ACCOUNT;
  return (
    <Form {...form}>
      <div className={inline ? 'flex flex-col gap-6' : 'mt-4 max-w-2xl space-y-8'}>
        <AuthMethodField
          authMethod={authMethod}
          disabled={isPending || serviceAccount.isServiceAccountPending}
          onAuthMethodChange={onAuthMethodChange}
        />
        {authMethod === AuthenticationMethod.SASL && <SaslUserFields {...saslProps} />}

        {isServiceAccount && hasServiceAccount ? <ExistingServiceAccountNotice /> : null}
        {isServiceAccount && !hasServiceAccount ? (
          <ServiceAccountFields isPending={isPending} serviceAccount={serviceAccount} />
        ) : null}
      </div>
    </Form>
  );
}
