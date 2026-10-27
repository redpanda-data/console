import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
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
import {
  ServiceAccountSelector,
  type ServiceAccountSelectorRef,
} from 'components/ui/service-account/service-account-selector';
import { CircleAlert, RefreshCcw } from 'lucide-react';
import type { MotionProps } from 'motion/react';
import { ACL_ResourcePatternType, ACL_ResourceType } from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { ListUsersResponse_User as User } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import {
  type Dispatch,
  forwardRef,
  type SetStateAction,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Resolver, type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { useCreateSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { useListUsersQuery } from 'react-query/api/user';
import { LONG_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';
import { toast } from 'sonner';
import { generatePassword } from 'utils/password';
import { generateServiceAccountName } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { SASL_MECHANISMS } from 'utils/user';

import { StepSurface } from './step-surface';
import { useListACLsQuery } from '../../../../react-query/api/acl';
import { userSecretIds } from '../types/constants';
import type { UserStepRef, UserStepSubmissionResult } from '../types/wizard';
import {
  type AddUserFormData,
  AuthenticationMethod,
  type AuthenticationMethodType,
  addUserFormSchema,
  CreatableSelectionOptions,
  type CreatableSelectionType,
  type ServiceAccountSubmissionData,
} from '../types/wizard';
import {
  checkUserHasConsumerGroupPermissions,
  checkUserHasTopicPermissions,
  getACLOperationName,
  saslMechanismFromProto,
  type TopicAccess,
  useCreateUserWithSecretsMutation,
} from '../utils/user';

type AddUserStepProps = {
  defaultUsername?: string;
  defaultSaslMechanism?: (typeof SASL_MECHANISMS)[number];
  hideInternal?: boolean;
  topicName?: string;
  /** A user who can already do this with the topic is granted nothing more. */
  topicAccess?: TopicAccess;
  defaultConsumerGroup?: string;
  showConsumerGroupFields?: boolean;
  onValidityChange?: (isValid: boolean) => void;
  defaultAuthMethod?: 'sasl' | 'service-account';
  defaultServiceAccountName?: string;
  /** The pipeline already has a service account, which the Service account tab keeps instead of creating one. */
  hasServiceAccount?: boolean;
  pipelineName?: string;
  selectionMode?: 'existing' | 'new' | 'both';
  hideTitle?: boolean;
  className?: string;
  // Renders the form bare (no Card chrome/min-height/margin) so it can sit
  // inside a host surface like a dialog body. Defaults to false for the wizard.
  inline?: boolean;
};

type UserForm = UseFormReturn<AddUserFormData>;
type SubmitUser = (userData: AddUserFormData) => Promise<UserStepSubmissionResult>;

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useAddUserForm({
  defaultUsername,
  defaultSaslMechanism,
  defaultConsumerGroup,
}: Pick<AddUserStepProps, 'defaultUsername' | 'defaultSaslMechanism' | 'defaultConsumerGroup'>) {
  return useForm<AddUserFormData>({
    resolver: zodResolver(addUserFormSchema) as Resolver<AddUserFormData>,
    mode: 'onChange',
    defaultValues: {
      username: defaultUsername || '',
      password: generatePassword(30, false),
      saslMechanism: defaultSaslMechanism || 'SCRAM-SHA-256',
      grantTopicPermissions: true,
      specialCharactersEnabled: false,
      passwordLength: 30,
      consumerGroup: defaultConsumerGroup || '',
    },
  });
}

function initialUserSelectionType(
  selectionMode: NonNullable<AddUserStepProps['selectionMode']>,
  hasUsers: boolean
): CreatableSelectionType {
  if (selectionMode === 'new') {
    return CreatableSelectionOptions.CREATE;
  }
  if (selectionMode === 'existing') {
    return CreatableSelectionOptions.EXISTING;
  }
  return hasUsers ? CreatableSelectionOptions.EXISTING : CreatableSelectionOptions.CREATE;
}

// The users to pick from, the Existing/New choice, and the existing user the typed name refers to.
function useUserSelection({
  form,
  hideInternal,
  selectionMode,
}: {
  form: UserForm;
  hideInternal: boolean;
  selectionMode: NonNullable<AddUserStepProps['selectionMode']>;
}) {
  const { data: usersList } = useListUsersQuery(undefined, {
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
    refetchOnWindowFocus: false,
  });
  const watchedUsername = useWatch({
    control: form.control,
    name: 'username',
  });

  const existingUserSelected = useMemo(() => {
    // Only check if the CURRENT form username matches an existing user
    // Don't use persisted username to avoid showing existing user state when creating a new one
    if (!watchedUsername) {
      return;
    }
    return usersList?.users?.find((user) => user.name === watchedUsername);
  }, [watchedUsername, usersList?.users]);

  const userOptions = useMemo(
    () =>
      (usersList?.users ?? [])
        .filter((user) => !(hideInternal && user.name?.startsWith('__')))
        .map((user) => ({
          value: user.name || '',
          label: user.name || '',
        })),
    [usersList, hideInternal]
  );

  const [userSelectionType, setUserSelectionType] = useState<CreatableSelectionType>(() =>
    initialUserSelectionType(selectionMode, userOptions.length > 0)
  );

  const handleUserSelectionTypeChange = useCallback(
    (value: string) => {
      setUserSelectionType(value as CreatableSelectionType);

      form.setValue('username', '', { shouldDirty: true });
    },
    [form]
  );

  const isReadOnly = Boolean(existingUserSelected) || userSelectionType === CreatableSelectionOptions.EXISTING;
  return {
    watchedUsername,
    existingUserSelected,
    userOptions,
    userSelectionType,
    handleUserSelectionTypeChange,
    isReadOnly,
  };
}

type UserSelection = ReturnType<typeof useUserSelection>;

function useTopicGrant({
  existingUserSelected,
  topicName,
  topicAccess,
}: {
  existingUserSelected?: User;
  topicName?: string;
  topicAccess: TopicAccess;
}) {
  const { data: aclData } = useListACLsQuery(
    {
      filter: {
        resourceType: ACL_ResourceType.TOPIC,
        resourceName: topicName,
        // Also returns the prefixed and wildcard ACLs that cover the topic.
        resourcePatternType: ACL_ResourcePatternType.MATCH,
      },
    },
    {
      enabled: Boolean(existingUserSelected && topicName),
      staleTime: LONG_LIVED_CACHE_STALE_TIME,
    }
  );

  const userTopicPermissions = useMemo(() => {
    if (!(existingUserSelected && topicName && aclData?.aclResources)) {
      return null;
    }

    return checkUserHasTopicPermissions(aclData.aclResources, topicName, existingUserSelected.name, topicAccess);
  }, [existingUserSelected, topicName, aclData, topicAccess]);

  // An existing user is granted the topic only if they lack access, which is assumed until their ACLs load.
  const needsTopicGrant =
    Boolean(topicName) && !(existingUserSelected && userTopicPermissions?.missingPermissions.length === 0);
  return { userTopicPermissions, needsTopicGrant };
}

function useConsumerGroupAccess({
  form,
  showConsumerGroupFields,
  existingUserSelected,
}: {
  form: UserForm;
  showConsumerGroupFields: boolean;
  existingUserSelected?: User;
}) {
  const { data: consumerGroupACLData } = useListACLsQuery(
    {
      filter: {
        resourceType: ACL_ResourceType.GROUP,
      },
    },
    {
      enabled: showConsumerGroupFields,
      staleTime: LONG_LIVED_CACHE_STALE_TIME,
    }
  );
  const watchedConsumerGroup = useWatch({
    control: form.control,
    name: 'consumerGroup',
  });

  const userConsumerGroupPermissions = useMemo(() => {
    if (
      !(showConsumerGroupFields && existingUserSelected && watchedConsumerGroup && consumerGroupACLData?.aclResources)
    ) {
      return null;
    }

    return checkUserHasConsumerGroupPermissions(
      consumerGroupACLData.aclResources,
      watchedConsumerGroup,
      existingUserSelected.name
    );
  }, [showConsumerGroupFields, existingUserSelected, watchedConsumerGroup, consumerGroupACLData]);
  return { watchedConsumerGroup, userConsumerGroupPermissions };
}

// The pipeline reads a user's credentials from secrets, which only exist for users created here.
function useMissingUserSecrets(existingUserSelected?: User) {
  const { data: secretsData } = useListSecretsQuery({}, { enabled: Boolean(existingUserSelected) });
  return useMemo(() => {
    if (!(existingUserSelected && secretsData)) {
      return [];
    }
    const stored = new Set(secretsData.secrets.map((secret) => secret.id));
    return Object.values(userSecretIds(existingUserSelected.name)).filter((id) => !stored.has(id));
  }, [existingUserSelected, secretsData]);
}

// What an existing user can already do, and what the pipeline still needs to give them.
function useExistingUserAccess({
  form,
  existingUserSelected,
  topicName,
  topicAccess,
  showConsumerGroupFields,
}: {
  form: UserForm;
  existingUserSelected?: User;
  topicName?: string;
  topicAccess: TopicAccess;
  showConsumerGroupFields: boolean;
}) {
  const topicGrant = useTopicGrant({ existingUserSelected, topicName, topicAccess });
  const consumerGroup = useConsumerGroupAccess({ form, showConsumerGroupFields, existingUserSelected });
  const missingUserSecrets = useMissingUserSecrets(existingUserSelected);
  return { ...topicGrant, ...consumerGroup, missingUserSecrets };
}

type ExistingUserAccess = ReturnType<typeof useExistingUserAccess>;

function useServiceAccountDraft({
  defaultServiceAccountName,
  pipelineName,
  topicName,
}: Pick<AddUserStepProps, 'defaultServiceAccountName' | 'pipelineName' | 'topicName'>) {
  const [serviceAccountName, setServiceAccountName] = useState<string>(
    defaultServiceAccountName || generateServiceAccountName(pipelineName || topicName || 'pipeline', 'pipeline')
  );
  const serviceAccountSelectorRef = useRef<ServiceAccountSelectorRef>(null);
  const [isServiceAccountPending, setIsServiceAccountPending] = useState(false);
  return {
    serviceAccountName,
    setServiceAccountName,
    serviceAccountSelectorRef,
    isServiceAccountPending,
    setIsServiceAccountPending,
  };
}

type ServiceAccountDraft = ReturnType<typeof useServiceAccountDraft>;

function useReportStepValidity({
  authMethod,
  hasServiceAccount,
  serviceAccountName,
  isServiceAccountPending,
  isFormValid,
  onValidityChange,
}: {
  authMethod: AuthenticationMethodType;
  hasServiceAccount: boolean;
  serviceAccountName: string;
  isServiceAccountPending: boolean;
  isFormValid: boolean;
  onValidityChange?: (isValid: boolean) => void;
}) {
  useEffect(
    function reportValidity() {
      const isValid =
        authMethod === AuthenticationMethod.SERVICE_ACCOUNT
          ? hasServiceAccount ||
            Boolean(serviceAccountName && serviceAccountName.trim().length > 0 && !isServiceAccountPending)
          : isFormValid;
      onValidityChange?.(isValid);
    },
    [authMethod, hasServiceAccount, serviceAccountName, isServiceAccountPending, isFormValid, onValidityChange]
  );
}

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

// ── Submission ─────────────────────────────────────────────────────────────────

function invalidateUserQueries(queryClient: QueryClient) {
  return Promise.all([
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
    queryClient.invalidateQueries({
      queryKey: ['consumer-groups'],
    }),
  ]);
}

async function createPipelineServiceAccount(
  selector: ServiceAccountSelectorRef,
  serviceAccountLabel: string,
  serviceAccountName: string
): Promise<UserStepSubmissionResult> {
  try {
    const result = await selector.createServiceAccount(serviceAccountLabel);

    if (!result) {
      return { success: false };
    }

    const submissionData: ServiceAccountSubmissionData = {
      authMethod: AuthenticationMethod.SERVICE_ACCOUNT,
      serviceAccountName,
      serviceAccountId: result.serviceAccountId,
      serviceAccountSecretName: result.secretName,
    };

    return {
      success: true,
      data: submissionData,
    };
  } catch (createServiceAccountError) {
    const error = ConnectError.from(createServiceAccountError);
    toast.error(formatToastErrorMessageGRPC({ error, action: 'create', entity: 'service account' }));
    return { success: false };
  }
}

function submitServiceAccount({
  hasServiceAccount,
  selector,
  serviceAccountLabel,
  serviceAccountName,
}: {
  hasServiceAccount: boolean;
  selector: ServiceAccountSelectorRef | null;
  serviceAccountLabel: string;
  serviceAccountName: string;
}): Promise<UserStepSubmissionResult> {
  if (hasServiceAccount) {
    return Promise.resolve({
      success: true,
      data: { authMethod: AuthenticationMethod.SERVICE_ACCOUNT, existing: true },
    });
  }
  if (!selector) {
    toast.error('Service account selector not initialized');
    return Promise.resolve({ success: false });
  }
  return createPipelineServiceAccount(selector, serviceAccountLabel, serviceAccountName);
}

function useAddUserSubmit({
  form,
  authMethod,
  hasServiceAccount,
  serviceAccount,
  pipelineName,
  topicName,
  needsTopicGrant,
  createUserWithSecrets,
  existingUserSelected,
  showConsumerGroupFields,
}: {
  form: UserForm;
  authMethod: AuthenticationMethodType;
  hasServiceAccount: boolean;
  serviceAccount: ServiceAccountDraft;
  pipelineName?: string;
  topicName?: string;
  needsTopicGrant: boolean;
  createUserWithSecrets: ReturnType<typeof useCreateUserWithSecretsMutation>['createUserWithSecrets'];
  existingUserSelected?: User;
  showConsumerGroupFields: boolean;
}) {
  const queryClient = useQueryClient();
  const { serviceAccountName, serviceAccountSelectorRef } = serviceAccount;

  return useCallback<SubmitUser>(
    async (userData) => {
      if (authMethod === AuthenticationMethod.SERVICE_ACCOUNT) {
        return submitServiceAccount({
          hasServiceAccount,
          selector: serviceAccountSelectorRef.current,
          serviceAccountLabel: pipelineName || topicName || 'pipeline',
          serviceAccountName,
        });
      }

      // An existing user logs in with the mechanism it was created with; the form only asks for a new one's.
      const existingMechanism = saslMechanismFromProto(existingUserSelected?.mechanism);
      const result = await createUserWithSecrets({
        userData: existingMechanism ? { ...userData, saslMechanism: existingMechanism } : userData,
        topicName: needsTopicGrant ? topicName : undefined,
        consumerGroup: showConsumerGroupFields ? form.getValues('consumerGroup') : undefined,
        existingUserSelected: Boolean(existingUserSelected),
      });

      if (result.success) {
        await invalidateUserQueries(queryClient);
      }

      return result;
    },
    [
      authMethod,
      hasServiceAccount,
      serviceAccountName,
      serviceAccountSelectorRef,
      pipelineName,
      topicName,
      needsTopicGrant,
      createUserWithSecrets,
      existingUserSelected,
      showConsumerGroupFields,
      form,
      queryClient,
    ]
  );
}

// A service account needs no form validation; a SASL user is submitted only once the form is valid.
async function triggerUserStepSubmit({
  form,
  authMethod,
  submit,
  signal,
}: {
  form: UserForm;
  authMethod: AuthenticationMethodType;
  submit: SubmitUser;
  signal?: AbortSignal;
}): Promise<UserStepSubmissionResult> {
  if (signal?.aborted) {
    return { success: false };
  }
  if (authMethod === AuthenticationMethod.SERVICE_ACCOUNT) {
    return submit(form.getValues());
  }
  const isUserFormValid = await form.trigger();
  if (signal?.aborted) {
    return { success: false };
  }
  if (isUserFormValid) {
    return submit(form.getValues());
  }
  return {
    success: false,
  };
}

// ── Form sections ──────────────────────────────────────────────────────────────

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
          if (!value) {
            return;
          }
          onAuthMethodChange(value as AuthenticationMethodType);
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
            if (!value) {
              return;
            }
            users.handleUserSelectionTypeChange(value as CreatableSelectionType);
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
        watchedConsumerGroup &&
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

      {watchedConsumerGroup &&
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

      {Boolean(showConsumerGroupFields) && (
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

function AddUserFormBody({
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

// ── Step ───────────────────────────────────────────────────────────────────────

export const AddUserStep = forwardRef<UserStepRef, AddUserStepProps & MotionProps>(
  (
    {
      defaultUsername,
      defaultSaslMechanism,
      hideInternal = true,
      topicName,
      topicAccess = 'read-write',
      defaultConsumerGroup,
      showConsumerGroupFields = false,
      onValidityChange,
      defaultAuthMethod,
      defaultServiceAccountName,
      hasServiceAccount = false,
      pipelineName,
      selectionMode = 'both',
      hideTitle,
      className,
      inline = false,
    },
    ref
  ) => {
    const form = useAddUserForm({ defaultUsername, defaultSaslMechanism, defaultConsumerGroup });
    const users = useUserSelection({ form, hideInternal, selectionMode });
    const access = useExistingUserAccess({
      form,
      existingUserSelected: users.existingUserSelected,
      topicName,
      topicAccess,
      showConsumerGroupFields,
    });
    const { createUserWithSecrets, isPending } = useCreateUserWithSecretsMutation();
    const [authMethod, setAuthMethod] = useState<AuthenticationMethodType>(
      defaultAuthMethod || AuthenticationMethod.SASL
    );
    const serviceAccount = useServiceAccountDraft({ defaultServiceAccountName, pipelineName, topicName });

    useReportStepValidity({
      authMethod,
      hasServiceAccount,
      serviceAccountName: serviceAccount.serviceAccountName,
      isServiceAccountPending: serviceAccount.isServiceAccountPending,
      isFormValid: form.formState.isValid,
      onValidityChange,
    });

    const handleSubmit = useAddUserSubmit({
      form,
      authMethod,
      hasServiceAccount,
      serviceAccount,
      pipelineName,
      topicName,
      needsTopicGrant: access.needsTopicGrant,
      createUserWithSecrets,
      existingUserSelected: users.existingUserSelected,
      showConsumerGroupFields,
    });

    useImperativeHandle(ref, () => ({
      triggerSubmit: (signal?: AbortSignal) =>
        triggerUserStepSubmit({ form, authMethod, submit: handleSubmit, signal }),
      isPending: isPending || serviceAccount.isServiceAccountPending,
    }));

    return (
      <StepSurface
        className={className}
        description="Select or create a SASL-SCRAM user that can interact with this topic."
        hideTitle={hideTitle}
        inline={inline}
        title="Configure a user with permissions"
      >
        <AddUserFormBody
          access={access}
          authMethod={authMethod}
          form={form}
          hasServiceAccount={hasServiceAccount}
          inline={inline}
          isPending={isPending}
          onAuthMethodChange={setAuthMethod}
          selectionMode={selectionMode}
          serviceAccount={serviceAccount}
          showConsumerGroupFields={showConsumerGroupFields}
          topicName={topicName}
          users={users}
        />
      </StepSurface>
    );
  }
);
