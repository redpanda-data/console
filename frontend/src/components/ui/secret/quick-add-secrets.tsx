/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

'use client';

import { create } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input, InputEnd } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertTriangle, Check, Key, Loader2, Plus } from 'lucide-react';
import { CreateSecretRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  CreateSecretRequestSchema as CreateSecretRequestSchemaDataPlane,
  type Scope,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';

interface QuickAddSecretsProps {
  requiredSecrets: string[];
  existingSecrets: string[];
  scopes: Scope[];
  defaultValues?: Record<string, string>;
  onSecretsCreated?: (secretNames: string[]) => void;
  enableNewSecrets?: boolean;
  hideHeader?: boolean;
  onError?: (errors: string[]) => void;
}

const SecretFormSchema = z.record(
  z.string(),
  z.object({
    value: z.string().min(1, 'Secret value is required'),
  })
);

type SecretFormData = z.infer<typeof SecretFormSchema>;

// Schema for adding a new secret (when enableNewSecrets is true)
const NewSecretFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Secret name is required')
    .max(255, 'Secret name must be fewer than 255 characters')
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*$/,
      'Secret name must start with a letter and contain only letters, numbers, and underscores'
    ),
  value: z.string().min(1, 'Secret value is required'),
});

type NewSecretFormData = z.infer<typeof NewSecretFormSchema>;

export const QuickAddSecrets: React.FC<QuickAddSecretsProps> = ({
  requiredSecrets,
  existingSecrets,
  scopes,
  defaultValues = {},
  onSecretsCreated,
  enableNewSecrets = false,
  onError,
}) => {
  const { mutateAsync: createSecret, isPending: isCreateSecretPending } = useCreateSecretMutation();
  const [createdSecrets, setCreatedSecrets] = useState<string[]>([]);
  const [newlyCreatedSecrets, setNewlyCreatedSecrets] = useState<string[]>([]);

  const missingSecrets = requiredSecrets.filter(
    (secret) => !(existingSecrets.includes(secret) || createdSecrets.includes(secret))
  );

  const form = useForm<SecretFormData>({
    resolver: zodResolver(SecretFormSchema),
    defaultValues: Object.fromEntries(
      missingSecrets.map((secretName) => [secretName, { value: defaultValues[secretName] || '' }])
    ),
  });

  const newSecretForm = useForm<NewSecretFormData>({
    resolver: zodResolver(NewSecretFormSchema),
    defaultValues: {
      name: '',
      value: '',
    },
  });

  const handleCreateSecrets = async (data: SecretFormData) => {
    const secretEntries = Object.entries(data);
    const errors: Array<{ secretName: string; error: ConnectError }> = [];
    const successfulSecrets: string[] = [];

    await Promise.allSettled(
      secretEntries.map(([secretName, { value }]) => {
        const dataPlaneRequest = create(CreateSecretRequestSchemaDataPlane, {
          id: secretName,
          secretData: base64ToUInt8Array(encodeBase64(value)),
          scopes,
          labels: {},
        });

        return createSecret(
          create(CreateSecretRequestSchema, {
            request: dataPlaneRequest,
          }),
          {
            onSuccess: () => {
              successfulSecrets.push(secretName);
            },
            onError: (error) => {
              errors.push({ secretName, error });
            },
          }
        );
      })
    );

    // Update created secrets state
    if (successfulSecrets.length > 0) {
      setCreatedSecrets((prev) => [...prev, ...successfulSecrets]);
      // Call onSecretsCreated callback
      onSecretsCreated?.(successfulSecrets);
    }

    // Handle errors
    if (errors.length > 0) {
      const errorMessages = errors.map(({ secretName, error }) =>
        formatToastErrorMessageGRPC({ error, action: 'create', entity: `secret ${secretName}` })
      );

      if (onError) {
        // Let parent handle error display
        onError(errorMessages);
      } else {
        // Display error toasts
        for (const message of errorMessages) {
          toast.error(message);
        }
      }
    }
  };

  const handleCreateNewSecret = async (data: NewSecretFormData) => {
    const secretName = data.name.toUpperCase();

    try {
      const dataPlaneRequest = create(CreateSecretRequestSchemaDataPlane, {
        id: secretName,
        secretData: base64ToUInt8Array(encodeBase64(data.value)),
        scopes,
        labels: {},
      });

      await createSecret(
        create(CreateSecretRequestSchema, {
          request: dataPlaneRequest,
        })
      );

      // Update created secrets state
      setCreatedSecrets((prev) => [...prev, secretName]);
      setNewlyCreatedSecrets((prev) => [...prev, secretName]);
      // Call onSecretsCreated callback
      onSecretsCreated?.([secretName]);
      // Reset form
      newSecretForm.reset();

      toast.success(`Secret "${secretName}" created successfully`);
    } catch (error) {
      const errorMessage = formatToastErrorMessageGRPC({
        error: error as ConnectError,
        action: 'create',
        entity: `secret ${secretName}`,
      });

      if (onError) {
        // Let parent handle error display
        onError([errorMessage]);
      } else {
        toast.error(errorMessage);
      }
    }
  };

  if (requiredSecrets.length === 0 && !enableNewSecrets) {
    return null;
  }

  return (
    <div className="space-y-4">
      {missingSecrets.length > 0 && (
        <Card size="full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Add Required Secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                The tool requires secrets to function properly. Create them below before proceeding.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <Form {...form}>
                  <form className="space-y-3" onSubmit={form.handleSubmit(handleCreateSecrets)}>
                    {missingSecrets.map((secretName) => (
                      <FormField
                        control={form.control}
                        key={secretName}
                        name={`${secretName}.value` as keyof SecretFormData}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-sm font-medium">{secretName}</FormLabel>
                            <FormControl>
                              <Input
                                name={field.name}
                                onBlur={field.onBlur}
                                onChange={field.onChange}
                                placeholder={`Enter value for ${secretName}...`}
                                ref={field.ref}
                                type="password"
                                value={typeof field.value === 'string' ? field.value : field.value?.value || ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}

                    <Button
                      className="w-full"
                      disabled={isCreateSecretPending || !form.formState.isValid}
                      type="submit"
                      variant="dashed"
                    >
                      {isCreateSecretPending ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <Text as="span">Creating...</Text>
                        </div>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          Create {missingSecrets.length} Secret
                          {missingSecrets.length > 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {enableNewSecrets && (
        <Card size="full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Add Secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Display newly created secrets */}
            {newlyCreatedSecrets.length > 0 && (
              <div className="space-y-2">
                <Text className="text-sm font-medium text-muted-foreground">Created Secrets:</Text>
                <div className="space-y-2">
                  {newlyCreatedSecrets.map((secretName) => (
                    <Input className="font-mono" disabled key={secretName} readOnly value={secretName}>
                      <InputEnd>
                        <Check className="h-4 w-4 text-green-600" />
                      </InputEnd>
                    </Input>
                  ))}
                </div>
              </div>
            )}

            {/* Form to add new secrets */}
            <div className="flex flex-col gap-2">
              <Form {...newSecretForm}>
                <form className="space-y-3" onSubmit={newSecretForm.handleSubmit(handleCreateNewSecret)}>
                  <FormField
                    control={newSecretForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Secret Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., API_KEY, DATABASE_PASSWORD" {...field} />
                        </FormControl>
                        <FormDescription>Secrets are stored in uppercase</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={newSecretForm.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Secret Value</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter secret value..." type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    className="w-full"
                    disabled={isCreateSecretPending || !newSecretForm.formState.isValid}
                    type="submit"
                    variant="dashed"
                  >
                    {isCreateSecretPending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <Text as="span">Creating...</Text>
                      </div>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        {newlyCreatedSecrets.length > 0 ? 'Create Another Secret' : 'Create Secret'}
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
