import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Link as TanStackRouterLink } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
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
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { type Resolver, useForm, useWatch } from 'react-hook-form';
import { useCreateSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { useListUsersQuery } from 'react-query/api/user';
import { LONG_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';
import { toast } from 'sonner';
import { generatePassword } from 'utils/password';
import { generateServiceAccountName } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { SASL_MECHANISMS } from 'utils/user';

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
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex form with dual auth methods requires conditional logic
  ) => {
    const queryClient = useQueryClient();

    const { data: usersList } = useListUsersQuery(undefined, {
      staleTime: LONG_LIVED_CACHE_STALE_TIME,
      refetchOnWindowFocus: false,
    });

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

    const form = useForm<AddUserFormData>({
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

    const watchedUsername = useWatch({
      control: form.control,
      name: 'username',
    });
    const watchedSpecialCharacters = useWatch({
      control: form.control,
      name: 'specialCharactersEnabled',
    });
    const watchedPasswordLength = useWatch({
      control: form.control,
      name: 'passwordLength',
    });
    const watchedConsumerGroup = useWatch({
      control: form.control,
      name: 'consumerGroup',
    });

    const existingUserSelected = useMemo(() => {
      // Only check if the CURRENT form username matches an existing user
      // Don't use persisted username to avoid showing existing user state when creating a new one
      if (!watchedUsername) {
        return;
      }
      return usersList?.users?.find((user) => user.name === watchedUsername);
    }, [watchedUsername, usersList?.users]);

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

    const { createUserWithSecrets, isPending } = useCreateUserWithSecretsMutation();
    const { mutateAsync: createSecret } = useCreateSecretMutation();

    const [authMethod, setAuthMethod] = useState<AuthenticationMethodType>(
      defaultAuthMethod || AuthenticationMethod.SASL
    );

    const [serviceAccountName, setServiceAccountName] = useState<string>(
      defaultServiceAccountName || generateServiceAccountName(pipelineName || topicName || 'pipeline', 'pipeline')
    );

    const serviceAccountSelectorRef = useRef<ServiceAccountSelectorRef>(null);
    const [isServiceAccountPending, setIsServiceAccountPending] = useState(false);

    useEffect(() => {
      const isValid =
        authMethod === AuthenticationMethod.SERVICE_ACCOUNT
          ? hasServiceAccount ||
            Boolean(serviceAccountName && serviceAccountName.trim().length > 0 && !isServiceAccountPending)
          : form.formState.isValid;
      onValidityChange?.(isValid);
    }, [
      authMethod,
      hasServiceAccount,
      serviceAccountName,
      isServiceAccountPending,
      form.formState.isValid,
      onValidityChange,
    ]);

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

    const [userSelectionType, setUserSelectionType] = useState<CreatableSelectionType>(() => {
      if (selectionMode === 'new') {
        return CreatableSelectionOptions.CREATE;
      }
      if (selectionMode === 'existing') {
        return CreatableSelectionOptions.EXISTING;
      }
      return userOptions.length === 0 ? CreatableSelectionOptions.CREATE : CreatableSelectionOptions.EXISTING;
    });

    const userTopicPermissions = useMemo(() => {
      if (!(existingUserSelected && topicName && aclData?.aclResources)) {
        return null;
      }

      return checkUserHasTopicPermissions(aclData.aclResources, topicName, existingUserSelected.name, topicAccess);
    }, [existingUserSelected, topicName, aclData, topicAccess]);

    // An existing user is granted the topic only if they lack access, which is assumed until their ACLs load.
    const needsTopicGrant =
      Boolean(topicName) && !(existingUserSelected && userTopicPermissions?.missingPermissions.length === 0);

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

    // The pipeline reads a user's credentials from secrets, which only exist for users created here.
    const { data: secretsData } = useListSecretsQuery({}, { enabled: Boolean(existingUserSelected) });
    const missingUserSecrets = useMemo(() => {
      if (!(existingUserSelected && secretsData)) {
        return [];
      }
      const stored = new Set(secretsData.secrets.map((secret) => secret.id));
      return Object.values(userSecretIds(existingUserSelected.name)).filter((id) => !stored.has(id));
    }, [existingUserSelected, secretsData]);

    const isReadOnly = Boolean(existingUserSelected) || userSelectionType === CreatableSelectionOptions.EXISTING;

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

    const handleSubmit = useCallback(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex form with dual auth methods requires conditional logic
      async (userData: AddUserFormData): Promise<UserStepSubmissionResult> => {
        if (authMethod === AuthenticationMethod.SERVICE_ACCOUNT) {
          if (hasServiceAccount) {
            return { success: true, data: { authMethod: AuthenticationMethod.SERVICE_ACCOUNT, existing: true } };
          }
          if (!serviceAccountSelectorRef.current) {
            toast.error('Service account selector not initialized');
            return { success: false };
          }

          const serviceAccountLabel = pipelineName || topicName || 'pipeline';
          try {
            const result = await serviceAccountSelectorRef.current.createServiceAccount(serviceAccountLabel);

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

        // An existing user logs in with the mechanism it was created with; the form only asks for a new one's.
        const existingMechanism = saslMechanismFromProto(existingUserSelected?.mechanism);
        const result = await createUserWithSecrets({
          userData: existingMechanism ? { ...userData, saslMechanism: existingMechanism } : userData,
          topicName: needsTopicGrant ? topicName : undefined,
          consumerGroup: showConsumerGroupFields ? form.getValues('consumerGroup') : undefined,
          existingUserSelected: Boolean(existingUserSelected),
        });

        if (result.success) {
          await Promise.all([
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

        return result;
      },
      [
        authMethod,
        hasServiceAccount,
        serviceAccountName,
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

    const handleUserSelectionTypeChange = useCallback(
      (value: string) => {
        setUserSelectionType(value as CreatableSelectionType);

        form.setValue('username', '', { shouldDirty: true });
      },
      [form]
    );

    useImperativeHandle(ref, () => ({
      triggerSubmit: async (signal?: AbortSignal) => {
        if (signal?.aborted) {
          return { success: false };
        }

        if (authMethod === AuthenticationMethod.SERVICE_ACCOUNT) {
          const userData = form.getValues();
          return handleSubmit(userData);
        }

        const isUserFormValid = await form.trigger();
        if (signal?.aborted) {
          return { success: false };
        }
        if (isUserFormValid) {
          const userData = form.getValues();
          return handleSubmit(userData);
        }
        return {
          success: false,
        };
      },
      isPending: isPending || isServiceAccountPending,
    }));

    const formBody = (
      <Form {...form}>
        <div className={inline ? 'flex flex-col gap-6' : 'mt-4 max-w-2xl space-y-8'}>
          <div className="flex flex-col gap-2">
            <FormLabel>Authentication method</FormLabel>
            <Tabs
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                setAuthMethod(value as AuthenticationMethodType);
              }}
              value={authMethod}
            >
              <TabsList>
                <TabsTrigger disabled={isPending || isServiceAccountPending} value={AuthenticationMethod.SASL}>
                  SASL user
                </TabsTrigger>
                <TabsTrigger
                  disabled={isPending || isServiceAccountPending}
                  value={AuthenticationMethod.SERVICE_ACCOUNT}
                >
                  Service account
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {authMethod === AuthenticationMethod.SASL && (
            <>
              <div className="flex flex-col gap-2">
                <FormLabel>Username</FormLabel>
                <FormDescription>Use an existing user, or create a new one.</FormDescription>
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    {selectionMode === 'both' && (
                      <Tabs
                        className="shrink-0"
                        onValueChange={(value) => {
                          if (!value) {
                            return;
                          }
                          handleUserSelectionTypeChange(value as CreatableSelectionType);
                        }}
                        value={userSelectionType}
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
                            {userSelectionType === CreatableSelectionOptions.EXISTING ? (
                              <Combobox
                                {...field}
                                className="w-full"
                                disabled={isPending}
                                onChange={(value) => {
                                  field.onChange(value);
                                }}
                                onOpen={() => {
                                  queryClient.invalidateQueries({
                                    queryKey: createConnectQueryKey({
                                      schema: listUsers,
                                      cardinality: 'infinite',
                                    }),
                                  });
                                  queryClient.invalidateQueries({
                                    queryKey: createConnectQueryKey({
                                      schema: listACLs,
                                      cardinality: 'finite',
                                    }),
                                  });
                                }}
                                options={userOptions}
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

                  {existingUserSelected && userSelectionType === CreatableSelectionOptions.CREATE && !isPending && (
                    <Alert variant="informative">
                      <AlertDescription>
                        A user named <b>{watchedUsername}</b> already exists. A reference to the existing user will be
                        used.
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
                          The user <b>{existingUserSelected.name}</b> has the following permissions for the{' '}
                          <b>{topicName}</b> topic:
                          <List>
                            {userTopicPermissions.hasPermissions.map((permission) => (
                              <ListItem key={permission}>{getACLOperationName(permission)}</ListItem>
                            ))}
                          </List>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
              {userSelectionType === CreatableSelectionOptions.CREATE && (
                <>
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
                              <Label className="font-normal text-muted-foreground" htmlFor="specialCharactersEnabled">
                                Generate with special characters
                              </Label>
                            </div>
                          )}
                        />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    disabled={isPending || isReadOnly}
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
                </>
              )}

              {Boolean(needsTopicGrant) && (
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
                        <FormLabel className="font-normal">Grant this user full access to {topicName}</FormLabel>
                      </div>
                      {field.value ? (
                        <FormDescription className="pl-7">
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
              )}

              {Boolean(showConsumerGroupFields) && (
                <div className="flex flex-col gap-2">
                  <FormLabel>Consumer group (optional)</FormLabel>
                  <FormDescription>
                    The group this input reads as, so its offsets are kept between restarts. It's set on the input and
                    the user is granted access to it. Leave it empty if the input reads explicit topic partitions.
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
                                queryClient.invalidateQueries({
                                  queryKey: createConnectQueryKey({
                                    schema: listACLs,
                                    cardinality: 'finite',
                                  }),
                                });
                              }}
                              placeholder="Enter a consumer group name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

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
                              <List>
                                {userConsumerGroupPermissions?.hasPermissions.map((permission) => (
                                  <ListItem key={permission}>{getACLOperationName(permission)}</ListItem>
                                ))}
                              </List>
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}

                    {watchedConsumerGroup &&
                      watchedConsumerGroup.length > 0 &&
                      (!existingUserSelected ||
                        (userConsumerGroupPermissions &&
                          userConsumerGroupPermissions.missingPermissions.length > 0)) && (
                        <Alert icon={<CircleAlert />} variant="warning">
                          <AlertTitle>Consumer group permissions will be configured</AlertTitle>
                          <AlertDescription>
                            <div className="text-body-sm">
                              {existingUserSelected ? (
                                <>
                                  The user <b>{existingUserSelected.name}</b> will be granted READ and DESCRIBE
                                  permissions for the <b>{watchedConsumerGroup}</b> consumer group.
                                </>
                              ) : (
                                <>
                                  This user will be able to consume messages from the <b>{watchedConsumerGroup}</b>{' '}
                                  consumer group.
                                </>
                              )}
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                  </div>
                </div>
              )}
            </>
          )}

          {authMethod === AuthenticationMethod.SERVICE_ACCOUNT && hasServiceAccount && (
            <Alert variant="informative">
              <AlertTitle>Uses this pipeline's service account</AlertTitle>
              <AlertDescription>
                This pipeline already has a service account, so this component logs in with it. No new account is
                created.
              </AlertDescription>
            </Alert>
          )}
          {authMethod === AuthenticationMethod.SERVICE_ACCOUNT && !hasServiceAccount && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <FormLabel htmlFor="serviceAccountName">Service account name</FormLabel>
                <FormDescription>
                  Auto-generated name for the service account. You can customize it if needed.
                </FormDescription>
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
                  Adding creates it right away, with the Writer role on this cluster. It's attached to the pipeline when
                  you save, and every component that logs in with a service account uses it.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      </Form>
    );

    if (inline) {
      return <div className={className}>{formBody}</div>;
    }

    return (
      <Card className={className} size="full" variant="ghost">
        {!hideTitle && (
          <CardHeader className="max-w-2xl">
            <CardTitle>
              <h2 className="text-heading-lg">Configure a user with permissions</h2>
            </CardTitle>
            <CardDescription className="mt-4">
              Select or create a SASL-SCRAM user that can interact with this topic.
            </CardDescription>
          </CardHeader>
        )}
        <CardContent className="min-h-[300px]">{formBody}</CardContent>
      </Card>
    );
  }
);
