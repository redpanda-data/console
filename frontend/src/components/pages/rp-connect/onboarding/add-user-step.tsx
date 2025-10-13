import { create } from '@bufbuild/protobuf';
import { zodResolver } from '@hookform/resolvers/zod';
import { generatePassword } from 'components/pages/acls/user-create';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { Combobox, type ComboboxOption } from 'components/redpanda-ui/components/combobox';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
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
import { useSessionStorage } from 'hooks/use-session-storage';
import { CircleAlert, RefreshCcw } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CONNECT_WIZARD_TOPIC_KEY, CONNECT_WIZARD_USER_KEY } from 'state/connect/state';
import { SASL_MECHANISMS } from 'utils/user';

import { CreateACLRequestSchema } from '../../../../protogen/redpanda/api/dataplane/v1/acl_pb';
import {
  CreateUserRequestSchema,
  type ListUsersResponse_User,
} from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { useLegacyCreateACLMutation } from '../../../../react-query/api/acl';
import { useCreateUserMutation } from '../../../../react-query/api/user';
import type { AddTopicFormData, BaseStepRef, StepSubmissionResult } from '../types/wizard';
import { type AddUserFormData, addUserFormSchema } from '../types/wizard';
import { createTopicSuperuserACLs, saslMechanismToProto } from '../utils/user';

interface AddUserStepProps {
  usersList: ListUsersResponse_User[];
}

export const AddUserStep = forwardRef<BaseStepRef<AddUserFormData>, AddUserStepProps>(({ usersList }, ref) => {
  const [persistedUserData, setUserFormData] =
    useSessionStorage<Omit<AddUserFormData, 'password'>>(CONNECT_WIZARD_USER_KEY);
  const [topicData] = useSessionStorage<AddTopicFormData>(CONNECT_WIZARD_TOPIC_KEY);

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

  const isLoading = createUserMutation.isPending || createACLMutation.isPending;

  // Initialize password generation settings from persisted data or defaults
  // Note: We don't persist the actual password (it's write-only in the API)
  const initialSpecialChars = useMemo(
    () => persistedUserData?.specialCharactersEnabled ?? false,
    [persistedUserData?.specialCharactersEnabled]
  );
  const initialPasswordLength = useMemo(
    () => persistedUserData?.passwordLength ?? 30,
    [persistedUserData?.passwordLength]
  );
  const initialPassword = useMemo(
    () => generatePassword(initialPasswordLength, initialSpecialChars),
    [initialPasswordLength, initialSpecialChars]
  );

  const form = useForm<AddUserFormData>({
    resolver: zodResolver(addUserFormSchema),
    mode: 'onChange',
    defaultValues: {
      username: persistedUserData?.username || '',
      password: initialPassword,
      saslMechanism: persistedUserData?.saslMechanism || 'SCRAM-SHA-256',
      superuser: persistedUserData?.superuser ?? true,
      specialCharactersEnabled: initialSpecialChars,
      passwordLength: initialPasswordLength,
    },
  });

  const watchedUsername = form.watch('username');
  const watchedSpecialCharacters = form.watch('specialCharactersEnabled');
  const watchedPasswordLength = form.watch('passwordLength');

  const existingUserBeingEdited = useMemo(() => {
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
      try {
        // Persist user data WITHOUT password (passwords are write-only in the API)
        const { password: _password, ...userDataWithoutPassword } = userData;
        setUserFormData(userDataWithoutPassword);

        if (existingUserBeingEdited) {
          return {
            success: true,
            message: `Using existing user "${userData.username}"`,
          };
        }

        const createUserRequest = create(CreateUserRequestSchema, {
          user: {
            name: userData.username,
            password: userData.password,
            mechanism: saslMechanismToProto(userData.saslMechanism),
          },
        });

        await createUserMutation.mutateAsync(createUserRequest);

        if (topicData?.topicName && userData.superuser) {
          const aclConfigs = createTopicSuperuserACLs(topicData.topicName, userData.username);

          for (const config of aclConfigs) {
            const aclRequest = create(CreateACLRequestSchema, config);
            await createACLMutation.mutateAsync(aclRequest);
          }
        }

        return {
          success: true,
          message: `Created user "${userData.username}" successfully!${
            topicData?.topicName && userData.superuser ? ` with permissions for topic "${topicData.topicName}"` : ''
          }`,
        };
      } catch (error) {
        return {
          success: false,
          message: 'Failed to create user or configure permissions',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    [existingUserBeingEdited, setUserFormData, createUserMutation, topicData?.topicName, createACLMutation]
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
    <Card size="full">
      <CardHeader className="max-w-2xl">
        <CardTitle>
          <Heading level={2}>Select a user</Heading>
        </CardTitle>
        <CardDescription className="mt-4">
          A Kafka user represents an application, service, or human identity that interacts with a cluster, either to
          produce data, consume data, or perform administrative tasks. Kafka uses Access Control Lists (ACLs) to manage
          what each user is allowed to do, providing fine-grained security and preventing unauthorized access.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-[50vh] min-h-[400px] overflow-y-auto">
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

            {existingUserBeingEdited && !isLoading && (
              <Alert>
                <CircleAlert className="h-4 w-4" />
                <AlertTitle>Existing User Selected</AlertTitle>
                <AlertDescription>
                  <Text>
                    This user already exists. To enable topic-specific permissions automatically, please create a new
                    user. You can see if this existing user already has permissions{' '}
                    <Link href={`/security/users/${existingUserBeingEdited.name}/details`}>here</Link>.
                  </Text>
                </AlertDescription>
              </Alert>
            )}

            {!existingUserBeingEdited && (
              <>
                <FormField
                  control={form.control}
                  disabled={isLoading}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
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
                      <FormLabel>SASL Mechanism</FormLabel>
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

                {topicData?.topicName && (
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
                              Enable topic-specific permissions for this user for "{topicData.topicName}"
                            </FormLabel>
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {field.value ? (
                              `This user will have full permissions (read, write, create, delete, describe, alter) on the selected topic "${topicData.topicName}".`
                            ) : (
                              <Alert variant="destructive">
                                <AlertTitle className="flex items-center gap-2">
                                  <CircleAlert size={15} />
                                  Want custom User Permissions?
                                </AlertTitle>
                                <AlertDescription>
                                  <Text>
                                    You can configure custom ACLs to connect your data to Redpanda{' '}
                                    <Link href="/security/acls" rel="noopener noreferrer" target="_blank">
                                      here
                                    </Link>
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
});
