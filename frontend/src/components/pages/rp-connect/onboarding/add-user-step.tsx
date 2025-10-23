import { createConnectQueryKey } from '@connectrpc/connect-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { generatePassword } from 'components/pages/acls/user-create';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { Combobox, type ComboboxOption } from 'components/redpanda-ui/components/combobox';
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
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Heading, Link, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { WaitingRedpanda } from 'components/redpanda-ui/components/waiting-redpanda';
import { CircleAlert, RefreshCcw, XIcon } from 'lucide-react';
import type { MotionProps } from 'motion/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as ReactRouterLink } from 'react-router-dom';
import { SASL_MECHANISMS } from 'utils/user';

import { listACLs } from '../../../../protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import type { ListUsersResponse_User } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { useCreateACLMutation, useListACLsQuery } from '../../../../react-query/api/acl';
import { useCreateSecretMutation } from '../../../../react-query/api/secret';
import { useCreateUserMutation } from '../../../../react-query/api/user';
import type { BaseStepRef, OperationResult, StepSubmissionResult } from '../types/wizard';
import {
  type AddUserFormData,
  addUserFormSchema,
  CreatableSelectionOptions,
  type CreatableSelectionType,
} from '../types/wizard';
import {
  checkUserHasTopicReadWritePermissions,
  configureUserPermissions,
  createKafkaUser,
  createPasswordSecret,
  createUsernameSecret,
  getACLOperationName,
} from '../utils/user';

interface AddUserStepProps {
  usersList: ListUsersResponse_User[];
  defaultUsername?: string;
  defaultSaslMechanism?: (typeof SASL_MECHANISMS)[number];
  topicName?: string;
}

export const AddUserStep = forwardRef<BaseStepRef<AddUserFormData>, AddUserStepProps & MotionProps>(
  ({ usersList, defaultUsername, defaultSaslMechanism, topicName, ...motionProps }, ref) => {
    const initialUserOptions = useMemo(
      () =>
        usersList.map((user) => ({
          value: user.name || '',
          label: user.name || '',
        })),
      [usersList]
    );
    const [userOptions, setUserOptions] = useState<ComboboxOption[]>(initialUserOptions);
    const [userSelectionType, setUserSelectionType] = useState<CreatableSelectionType>(
      userOptions.length === 0 ? CreatableSelectionOptions.CREATE : CreatableSelectionOptions.EXISTING
    );
    const queryClient = useQueryClient();
    const createUserMutation = useCreateUserMutation();
    const createACLMutation = useCreateACLMutation();
    const createSecretMutation = useCreateSecretMutation({ skipInvalidation: true });

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
      },
    });

    const watchedUsername = form.watch('username');
    const watchedSpecialCharacters = form.watch('specialCharactersEnabled');
    const watchedPasswordLength = form.watch('passwordLength');

    const existingUserSelected = useMemo(() => {
      // Only check if the CURRENT form username matches an existing user
      // Don't use persisted username to avoid showing existing user state when creating a new one
      if (!watchedUsername) {
        return undefined;
      }
      return usersList?.find((user) => user.name === watchedUsername);
    }, [watchedUsername, usersList]);

    const { data: aclData, refetch: refetchACLs } = useListACLsQuery(undefined, {
      enabled: Boolean(existingUserSelected && topicName),
      refetchOnMount: 'always',
      staleTime: 0,
    });

    // Refetch ACLs whenever the selected user changes
    useEffect(() => {
      if (existingUserSelected && topicName) {
        refetchACLs();
      }
    }, [existingUserSelected, topicName, refetchACLs]);

    const userTopicPermissions = useMemo(() => {
      if (!(existingUserSelected && topicName && aclData?.aclResources)) {
        return null;
      }

      return checkUserHasTopicReadWritePermissions(aclData.aclResources, topicName, existingUserSelected.name);
    }, [existingUserSelected, topicName, aclData]);

    const isLoading = createUserMutation.isPending || createACLMutation.isPending || createSecretMutation.isPending;
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

    useEffect(() => {
      setUserOptions(initialUserOptions);
    }, [initialUserOptions]);

    const handleSubmit = useCallback(
      async (userData: AddUserFormData): Promise<StepSubmissionResult<AddUserFormData>> => {
        const operations: OperationResult[] = [];

        if (existingUserSelected) {
          return {
            success: true,
            message: `Using existing user "${userData.username}"`,
            data: userData,
            operations: [
              {
                operation: 'Select existing user',
                success: true,
                message: `Using existing user "${userData.username}"`,
              },
            ],
          };
        }

        const userResult = await createKafkaUser(userData, createUserMutation);
        operations.push(userResult);

        if (!userResult.success) {
          return {
            success: false,
            message: 'Failed to create user',
            error: userResult.error,
            data: userData,
            operations,
          };
        }

        if (topicName && userData.superuser) {
          const aclResult = await configureUserPermissions(topicName, userData.username, createACLMutation);
          operations.push(aclResult);

          if (!aclResult.success) {
            return {
              success: false,
              message: 'User created but failed to configure permissions',
              error: aclResult.error,
              data: userData,
              operations,
            };
          }

          // Invalidate ACL cache to ensure fresh data on next query
          await queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({
              schema: listACLs,
              cardinality: 'finite',
            }),
            exact: false,
          });
        }

        const usernameSecretResult = await createUsernameSecret(userData.username, createSecretMutation);
        operations.push(usernameSecretResult);

        const passwordSecretResult = await createPasswordSecret(
          userData.username,
          userData.password,
          createSecretMutation
        );
        operations.push(passwordSecretResult);

        const allSucceeded = operations.every((op) => op.success);
        const criticalOps = operations.filter(
          (op) => op.operation.includes('user') || op.operation.includes('permissions')
        );
        const criticalSucceeded = criticalOps.length === 0 || criticalOps.every((op) => op.success);

        let message: string;
        if (allSucceeded) {
          message = `Created user "${userData.username}" successfully!`;
        } else if (criticalSucceeded) {
          message = `User "${userData.username}" created but some non-critical operations failed`;
        } else {
          message = 'Failed to complete user creation';
        }

        return {
          success: allSucceeded,
          message,
          data: userData,
          operations,
        };
      },
      [existingUserSelected, createUserMutation, topicName, createACLMutation, createSecretMutation, queryClient]
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

    useImperativeHandle(ref, () => ({
      triggerSubmit: async () => {
        const isUserFormValid = await form.trigger();

        if (isUserFormValid) {
          const userData = form.getValues();
          return handleSubmit(userData);
        }
        return {
          success: false,
          message: 'Please fix the form errors before proceeding',
          error: 'Form validation failed',
        };
      },
      isLoading,
    }));

    return (
      <Card size="full" {...motionProps} animated>
        <CardHeader className="max-w-2xl">
          <CardTitle>
            <Heading level={2}>Configure a user with permissions</Heading>
          </CardTitle>
          <CardDescription className="mt-4">
            Select or create a SASL-SCRAM user that will interact with this pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px]">
          <Form {...form}>
            <div className="mt-4 max-w-2xl space-y-8">
              <div className="flex flex-col gap-2">
                <FormLabel>Username</FormLabel>
                <FormDescription>
                  {topicName
                    ? `Choose an existing user that has permissions for ${topicName}, or create a new one with full permissions.`
                    : 'Select an existing user or create a new one.'}
                </FormDescription>
                <div className="flex gap-2">
                  <RadioGroup
                    className="max-h-8 min-w-[220px]"
                    defaultValue={userSelectionType}
                    disabled={isLoading}
                    onValueChange={handleUserSelectionTypeChange}
                    orientation="horizontal"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        id={CreatableSelectionOptions.EXISTING}
                        value={CreatableSelectionOptions.EXISTING}
                      />
                      <Label htmlFor={CreatableSelectionOptions.EXISTING}>Existing user</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem id={CreatableSelectionOptions.CREATE} value={CreatableSelectionOptions.CREATE} />
                      <Label htmlFor={CreatableSelectionOptions.CREATE}>New user</Label>
                    </div>
                  </RadioGroup>

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
                              disabled={isLoading}
                              options={userOptions}
                              placeholder="Select a user"
                            />
                          ) : (
                            <Input
                              {...field}
                              className="w-[300px]"
                              disabled={isLoading}
                              placeholder="Enter a username"
                            />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedUsername !== '' && watchedUsername.length > 0 && (
                    <Button onClick={handleClearUsername} size="icon" variant="ghost">
                      <XIcon size={16} />
                    </Button>
                  )}
                </div>
              </div>

              {existingUserSelected &&
                topicName &&
                !isLoading &&
                userTopicPermissions &&
                userTopicPermissions.missingPermissions.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>
                      <CircleAlert className="h-4 w-4" /> User does not have required permissions
                    </AlertTitle>
                    <AlertDescription>
                      <Text variant="small">
                        The user <b>{existingUserSelected.name}</b> is missing the following permissions for the{' '}
                        <b>{topicName}</b> topic:
                        <List>
                          {userTopicPermissions.missingPermissions.map((permission) => (
                            <ListItem key={permission}>{getACLOperationName(permission)}</ListItem>
                          ))}
                        </List>
                      </Text>
                      <Text variant="small">
                        The user will need both READ and WRITE permissions to interact with the <b>{topicName}</b> topic
                        within a pipeline. Edit the user's{' '}
                        <Link
                          as={ReactRouterLink}
                          className="text-blue-800"
                          to={`/security/users/${existingUserSelected.name}/details`}
                        >
                          ACLs
                        </Link>{' '}
                        to add the missing permissions.
                      </Text>
                    </AlertDescription>
                  </Alert>
                )}
              {existingUserSelected &&
                topicName &&
                !isLoading &&
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
              {!existingUserSelected && isLoading && <WaitingRedpanda />}
              {!(existingUserSelected || isLoading) && userSelectionType === CreatableSelectionOptions.CREATE && (
                <>
                  <FormField
                    control={form.control}
                    disabled={isLoading || isReadOnly}
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
                    disabled={isLoading || isReadOnly}
                    name="saslMechanism"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SASL mechanism</FormLabel>
                        <FormControl>
                          <Select {...field}>
                            <SelectTrigger>
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

                  {topicName && (
                    <FormField
                      control={form.control}
                      disabled={isLoading || isReadOnly}
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
                                  This user will have full permissions (read, write, create, delete, describe, alter) on
                                  for the <b>{topicName}</b> topic.
                                </span>
                              ) : (
                                <Alert variant="destructive">
                                  <AlertTitle>
                                    <Text className="flex items-center gap-2" variant="label">
                                      <CircleAlert size={15} />
                                      Want custom user permissions?
                                    </Text>
                                  </AlertTitle>
                                  <AlertDescription>
                                    <Text variant="small">
                                      Configure{' '}
                                      <Link as={ReactRouterLink} rel="noopener noreferrer" to="/security/acls">
                                        access control lists (ACLs)
                                      </Link>
                                      .
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
            </div>
          </Form>
        </CardContent>
      </Card>
    );
  }
);
