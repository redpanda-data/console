import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { FEATURE_FLAGS } from 'components/constants';
import { generatePassword } from 'components/pages/acls/user-create';
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
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { Heading, Link, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import {
  ServiceAccountSelector,
  type ServiceAccountSelectorRef,
} from 'components/ui/service-account/service-account-selector';
import { config } from 'config';
import { CircleAlert, RefreshCcw, XIcon } from 'lucide-react';
import type { MotionProps } from 'motion/react';
import { ACL_ResourceType } from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { useListUsersQuery } from 'react-query/api/user';
import { LONG_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';
import { Link as ReactRouterLink } from 'react-router-dom';
import { toast } from 'sonner';
import { generateServiceAccountName } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { SASL_MECHANISMS } from 'utils/user';

import { useListACLsQuery } from '../../../../react-query/api/acl';
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
  checkUserHasTopicReadWritePermissions,
  getACLOperationName,
  useCreateUserWithSecretsMutation,
} from '../utils/user';

type AddUserStepProps = {
  defaultUsername?: string;
  defaultSaslMechanism?: (typeof SASL_MECHANISMS)[number];
  topicName?: string;
  defaultConsumerGroup?: string;
  showConsumerGroupFields?: boolean;
  onValidityChange?: (isValid: boolean) => void;
  defaultAuthMethod?: 'sasl' | 'service-account';
  defaultServiceAccountName?: string;
  pipelineName?: string;
};

export const AddUserStep = forwardRef<UserStepRef, AddUserStepProps & MotionProps>(
  (
    {
      defaultUsername,
      defaultSaslMechanism,
      topicName,
      defaultConsumerGroup,
      showConsumerGroupFields = false,
      onValidityChange,
      defaultAuthMethod,
      defaultServiceAccountName,
      pipelineName,
      ...motionProps
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
      resolver: zodResolver(addUserFormSchema),
      mode: 'onChange',
      defaultValues: {
        username: defaultUsername || '',
        password: generatePassword(30, false),
        saslMechanism: defaultSaslMechanism || 'SCRAM-SHA-256',
        superuser: true,
        specialCharactersEnabled: false,
        passwordLength: 30,
        consumerGroup: defaultConsumerGroup || '',
      },
    });

    const watchedUsername = form.watch('username');
    const watchedSpecialCharacters = form.watch('specialCharactersEnabled');
    const watchedPasswordLength = form.watch('passwordLength');
    const watchedConsumerGroup = form.watch('consumerGroup');

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

    // Notify parent when validity changes
    useEffect(() => {
      const isValid =
        authMethod === AuthenticationMethod.SERVICE_ACCOUNT
          ? Boolean(serviceAccountName && serviceAccountName.trim().length > 0 && !isServiceAccountPending)
          : form.formState.isValid;
      onValidityChange?.(isValid);
    }, [authMethod, serviceAccountName, isServiceAccountPending, form.formState.isValid, onValidityChange]);

    const userOptions = useMemo(
      () =>
        (usersList?.users ?? []).map((user) => ({
          value: user.name || '',
          label: user.name || '',
        })),
      [usersList]
    );

    const [userSelectionType, setUserSelectionType] = useState<CreatableSelectionType>(
      userOptions.length === 0 ? CreatableSelectionOptions.CREATE : CreatableSelectionOptions.EXISTING
    );

    const userTopicPermissions = useMemo(() => {
      if (!(existingUserSelected && topicName && aclData?.aclResources)) {
        return null;
      }

      return checkUserHasTopicReadWritePermissions(aclData.aclResources, topicName, existingUserSelected.name);
    }, [existingUserSelected, topicName, aclData]);

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
        // Service account flow
        if (authMethod === AuthenticationMethod.SERVICE_ACCOUNT) {
          if (!serviceAccountSelectorRef.current) {
            toast.error('Service account selector not initialized');
            return { success: false };
          }

          try {
            const result = await serviceAccountSelectorRef.current.createServiceAccount(
              pipelineName || topicName || 'pipeline'
            );

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

        // Existing SASL flow
        const result = await createUserWithSecrets({
          userData,
          topicName,
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
        serviceAccountName,
        pipelineName,
        topicName,
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

    const handleClearUsername = useCallback(() => {
      form.setValue('username', '', { shouldDirty: true });
    }, [form]);

    const handleClearConsumerGroup = useCallback(() => {
      form.setValue('consumerGroup', '', { shouldDirty: true });
    }, [form]);

    useImperativeHandle(ref, () => ({
      triggerSubmit: async () => {
        if (authMethod === AuthenticationMethod.SERVICE_ACCOUNT) {
          // Service account doesn't use form validation
          const userData = form.getValues(); // Pass dummy data
          return handleSubmit(userData);
        }

        const isUserFormValid = await form.trigger();
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

    return (
      <Card size="full" {...motionProps} animated>
        <CardHeader className="max-w-2xl">
          <CardTitle>
            <Heading level={2}>Configure a user with permissions</Heading>
          </CardTitle>
          <CardDescription className="mt-4">
            Select or create a SASL-SCRAM user that can interact with this topic.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px]">
          <Form {...form}>
            <div className="mt-4 max-w-2xl space-y-8">
              {Boolean(
                config.featureFlags?.enablePipelineServiceAccount ?? FEATURE_FLAGS.enablePipelineServiceAccount
              ) && (
                <div className="flex flex-col gap-2">
                  <FormLabel>Authentication Method</FormLabel>
                  <FormDescription>Choose how to authenticate the pipeline with your Redpanda cluster</FormDescription>
                  <ToggleGroup
                    disabled={isPending || isServiceAccountPending}
                    onValueChange={(value) => {
                      if (!value) {
                        return;
                      }
                      setAuthMethod(value as AuthenticationMethodType);
                    }}
                    type="single"
                    value={authMethod}
                    variant="outline"
                  >
                    <ToggleGroupItem value={AuthenticationMethod.SASL}>SASL User</ToggleGroupItem>
                    <ToggleGroupItem value={AuthenticationMethod.SERVICE_ACCOUNT}>Service Account</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              )}

              {authMethod === AuthenticationMethod.SASL && (
                <>
                  <div className="flex flex-col gap-2">
                    <FormLabel>Username</FormLabel>
                    <FormDescription>
                      {topicName
                        ? `Choose an existing user that has permissions for ${topicName}, or create a new one with full permissions.`
                        : 'Select an existing user or create a new one.'}
                    </FormDescription>
                    <div className="flex flex-col items-start gap-2">
                      <ToggleGroup
                        disabled={isPending}
                        onValueChange={(value) => {
                          // Prevent deselection - ToggleGroup emits empty string when trying to deselect
                          if (!value) {
                            return;
                          }
                          handleUserSelectionTypeChange(value as CreatableSelectionType);
                        }}
                        type="single"
                        value={userSelectionType}
                        variant="outline"
                      >
                        <ToggleGroupItem
                          disabled={isPending}
                          id={CreatableSelectionOptions.EXISTING}
                          value={CreatableSelectionOptions.EXISTING}
                        >
                          Existing
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          disabled={isPending}
                          id={CreatableSelectionOptions.CREATE}
                          value={CreatableSelectionOptions.CREATE}
                        >
                          New
                        </ToggleGroupItem>
                      </ToggleGroup>

                      <div className="flex gap-2">
                        <FormField
                          control={form.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                {userSelectionType === CreatableSelectionOptions.EXISTING ? (
                                  <Combobox
                                    {...field}
                                    className="w-[300px]"
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
                                    }}
                                    options={userOptions}
                                    placeholder="Select a user"
                                  />
                                ) : (
                                  <Input
                                    {...field}
                                    className="w-[300px]"
                                    disabled={isPending}
                                    placeholder="Enter a username"
                                  />
                                )}
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {watchedUsername !== '' && watchedUsername.length > 0 && (
                          <Button disabled={isPending} onClick={handleClearUsername} size="icon" variant="ghost">
                            <XIcon size={16} />
                          </Button>
                        )}
                      </div>

                      {existingUserSelected &&
                        userSelectionType === CreatableSelectionOptions.EXISTING &&
                        topicName &&
                        userTopicPermissions &&
                        userTopicPermissions.missingPermissions.length > 0 && (
                          <Alert variant="destructive">
                            <AlertTitle>
                              <CircleAlert className="h-4 w-4" /> User does not have required permissions
                            </AlertTitle>
                            <AlertDescription>
                              <Text variant="small">
                                The user <b>{existingUserSelected.name}</b> requires the following permissions for the{' '}
                                <b>{topicName}</b> topic:
                                <List>
                                  {userTopicPermissions.missingPermissions.map((permission) => (
                                    <ListItem key={permission}>{getACLOperationName(permission)}</ListItem>
                                  ))}
                                </List>
                              </Text>
                              <Text variant="small">
                                Edit the user's{' '}
                                <Link
                                  as={ReactRouterLink}
                                  className="text-blue-800"
                                  to={`/security/users/${existingUserSelected.name}/details`}
                                >
                                  ACLs
                                </Link>{' '}
                                to add permissions.
                              </Text>
                            </AlertDescription>
                          </Alert>
                        )}
                      {existingUserSelected &&
                        topicName &&
                        userSelectionType === CreatableSelectionOptions.EXISTING &&
                        userTopicPermissions &&
                        userTopicPermissions.hasPermissions.length > 0 && (
                          <Alert variant="success">
                            <AlertTitle>
                              <CircleAlert className="h-4 w-4" /> User has required permissions
                            </AlertTitle>
                            <AlertDescription>
                              <Text variant="small">
                                The user <b>{existingUserSelected.name}</b> has the following permissions for the{' '}
                                <b>{topicName}</b> topic:
                                <List>
                                  {userTopicPermissions.hasPermissions.map((permission) => (
                                    <ListItem key={permission}>{getACLOperationName(permission)}</ListItem>
                                  ))}
                                </List>
                              </Text>
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
                                <Input type="password" {...field} className="w-[300px]" />
                                <CopyButton content={field.value} disabled={isReadOnly} size="icon" variant="outline" />
                                <Button
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
                                <Label className="flex-row items-center font-normal text-muted-foreground">
                                  <Checkbox
                                    checked={specialCharsField.value}
                                    onCheckedChange={(val) => handleSpecialCharsChange(val, specialCharsField.onChange)}
                                    {...field}
                                  />
                                  Generate with special characters
                                </Label>
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
                                <SelectTrigger className="w-[300px]">
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

                      {Boolean(topicName) && (
                        <FormField
                          control={form.control}
                          disabled={isPending || isReadOnly}
                          name="superuser"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center space-x-3">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      disabled={field.disabled}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-medium text-sm">
                                    Enable topic-specific permissions for this user for "{topicName}"
                                  </FormLabel>
                                </div>
                                <p className="text-muted-foreground text-sm">
                                  {field.value && topicName ? (
                                    <span>
                                      This user will have full permissions (read, write, create, delete, describe,
                                      alter) on for the <b>{topicName}</b> topic.
                                    </span>
                                  ) : (
                                    <Alert variant="destructive">
                                      <AlertTitle>
                                        <Text className="flex items-center gap-2" variant="label">
                                          <CircleAlert size={15} />
                                          User will not be able to read from topic
                                        </Text>
                                      </AlertTitle>
                                      <AlertDescription>
                                        <Text variant="small">
                                          You will need to configure{' '}
                                          <Link as={ReactRouterLink} rel="noopener noreferrer" to="/security/acls">
                                            ACLs
                                          </Link>{' '}
                                          for custom user permissions if you want the user to be able to read from the
                                          topic.
                                        </Text>
                                      </AlertDescription>
                                    </Alert>
                                  )}
                                </p>

                                <FormMessage />
                              </div>
                            </FormItem>
                          )}
                        />
                      )}
                    </>
                  )}

                  {Boolean(showConsumerGroupFields) && (
                    <div className="flex flex-col gap-2">
                      <FormLabel>Consumer Group (Optional)</FormLabel>
                      <FormDescription>
                        Associate a consumer group with this user to persist consumer offset position. Or when creating
                        your pipeline specify a partition on the topic instead.
                      </FormDescription>
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex gap-2">
                          <FormField
                            control={form.control}
                            name="consumerGroup"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    {...field}
                                    className="w-[300px]"
                                    disabled={isPending}
                                    placeholder="Enter a consumer group name"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {watchedConsumerGroup !== '' && watchedConsumerGroup && watchedConsumerGroup.length > 0 && (
                            <Button disabled={isPending} onClick={handleClearConsumerGroup} size="icon" variant="ghost">
                              <XIcon size={16} />
                            </Button>
                          )}
                        </div>

                        {existingUserSelected &&
                          watchedConsumerGroup &&
                          userConsumerGroupPermissions &&
                          userConsumerGroupPermissions.missingPermissions.length === 0 &&
                          userConsumerGroupPermissions.hasPermissions.length > 0 && (
                            <Alert variant="success">
                              <AlertTitle>
                                <CircleAlert className="h-4 w-4" /> User has required consumer group permissions
                              </AlertTitle>
                              <AlertDescription>
                                <Text variant="small">
                                  The user <b>{existingUserSelected?.name}</b> has the following permissions for the{' '}
                                  <b>{watchedConsumerGroup}</b> consumer group:
                                  <List>
                                    {userConsumerGroupPermissions?.hasPermissions.map((permission) => (
                                      <ListItem key={permission}>{getACLOperationName(permission)}</ListItem>
                                    ))}
                                  </List>
                                </Text>
                              </AlertDescription>
                            </Alert>
                          )}

                        {watchedConsumerGroup &&
                          watchedConsumerGroup.length > 0 &&
                          (!existingUserSelected ||
                            (userConsumerGroupPermissions &&
                              userConsumerGroupPermissions.missingPermissions.length > 0)) && (
                            <Alert variant="warning">
                              <AlertTitle>
                                <Text className="flex items-center gap-2" variant="label">
                                  <CircleAlert size={15} />
                                  Consumer group permissions will be configured
                                </Text>
                              </AlertTitle>
                              <AlertDescription>
                                <Text variant="small">
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
                                </Text>
                              </AlertDescription>
                            </Alert>
                          )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {authMethod === AuthenticationMethod.SERVICE_ACCOUNT && (
                <div className="space-y-4">
                  <Alert>
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Service Account Authentication</AlertTitle>
                    <AlertDescription>
                      A service account will be created with Writer role permissions on the cluster. Credentials are
                      stored securely and referenced in the pipeline configuration.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <FormLabel htmlFor="serviceAccountName">Service Account Name</FormLabel>
                    <FormDescription>
                      Auto-generated name for the service account. You can customize it if needed.
                    </FormDescription>
                    <Input
                      className="w-[300px]"
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
                </div>
              )}
            </div>
          </Form>
        </CardContent>
      </Card>
    );
  }
);
