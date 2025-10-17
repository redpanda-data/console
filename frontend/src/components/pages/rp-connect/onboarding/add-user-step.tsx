import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
import { CircleAlert, RefreshCcw } from 'lucide-react';
import type { MotionProps } from 'motion/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { SASL_MECHANISMS } from 'utils/user';

import type { ListUsersResponse_User } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { useLegacyCreateACLMutation } from '../../../../react-query/api/acl';
import { useCreateSecretMutation } from '../../../../react-query/api/secret';
import { useCreateUserMutation } from '../../../../react-query/api/user';
import type { BaseStepRef, OperationResult, StepSubmissionResult } from '../types/wizard';
import { type AddUserFormData, addUserFormSchema } from '../types/wizard';
import { configureUserPermissions, createKafkaUser, createPasswordSecret, createUsernameSecret } from '../utils/user';

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
    const createUserMutation = useCreateUserMutation();
    const createACLMutation = useLegacyCreateACLMutation();
    const createSecretMutation = useCreateSecretMutation({ skipInvalidation: true });

    const isLoading = createUserMutation.isPending || createACLMutation.isPending || createSecretMutation.isPending;

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

    const generateNewPassword = useCallback(() => {
      const newPassword = generatePassword(watchedPasswordLength, watchedSpecialCharacters);
      form.setValue('password', newPassword, { shouldDirty: true });
    }, [watchedPasswordLength, watchedSpecialCharacters, form]);

    const handleCreateUserOption = useCallback((value: string) => {
      setUserOptions((prev) => [...prev, { value, label: value }]);
    }, []);

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
                message: `User "${userData.username}" already exists`,
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
      [existingUserSelected, createUserMutation, topicName, createACLMutation, createSecretMutation]
    );

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
        <CardContent className="max-h-[35vh] min-h-[300px] overflow-y-auto">
          <Form {...form}>
            <div className="max-w-2xl space-y-8">
              <FormField
                control={form.control}
                disabled={isLoading}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Combobox
                        {...field}
                        creatable
                        onCreateOption={handleCreateUserOption}
                        options={userOptions}
                        placeholder="Select or create a user..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {existingUserSelected && !isLoading && (
                <Alert variant="warning">
                  <CircleAlert className="h-4 w-4" />
                  <AlertTitle>Existing user selected</AlertTitle>
                  <AlertDescription>
                    <span>
                      To enable topic-level permissions, create a new user. See existing users and permissions on the{' '}
                      <Link
                        className="text-blue-800"
                        href={`/security/users/${existingUserSelected.name}/details`}
                        target="_blank"
                      >
                        Permissions List
                      </Link>
                      .
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {!existingUserSelected && (
                <>
                  <FormField
                    control={form.control}
                    disabled={isLoading}
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
                            <CopyButton content={field.value} size="icon" variant="outline" />
                            <Button onClick={generateNewPassword} size="icon" type="button" variant="outline">
                              <RefreshCcw size={15} />
                            </Button>
                          </Group>
                        </FormControl>
                        <FormMessage />
                        <FormField
                          {...field}
                          control={form.control}
                          name="specialCharactersEnabled"
                          render={({ field: specialCharsField }) => (
                            <Label className="flex-row items-center font-normal text-muted-foreground">
                              <Checkbox
                                checked={specialCharsField.value}
                                onCheckedChange={(val) => handleSpecialCharsChange(val, specialCharsField.onChange)}
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
                    disabled={isLoading}
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
                      disabled={isLoading}
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
                              {field.value ? (
                                `This user will have full permissions (read, write, create, delete, describe, alter) on the selected topic "${topicName}".`
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
                                      <Link href="/security/acls" rel="noopener noreferrer" target="_blank">
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
