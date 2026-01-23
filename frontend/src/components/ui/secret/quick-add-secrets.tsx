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
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input, InputEnd } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertTriangle, Check, Key, Loader2, Plus } from 'lucide-react';
import { CreateSecretRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  CreateSecretRequestSchema as CreateSecretRequestSchemaDataPlane,
  type Scope,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { ALPHANUMERIC_WITH_HYPHENS } from 'utils/regex';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';

type QuickAddSecretsProps = {
  requiredSecrets: string[];
  existingSecrets: string[];
  scopes: Scope[];
  defaultValues?: Record<string, string>;
  onSecretsCreated?: (secretNames: string[]) => void;
  enableNewSecrets?: boolean;
  hideHeader?: boolean;
  onError?: (errors: string[]) => void;
  onUpdateEditorContent?: (oldName: string, newName: string) => void;
};

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
  onUpdateEditorContent,
}) => {
  const { mutateAsync: createSecret } = useCreateSecretMutation();
  const [createdSecrets, setCreatedSecrets] = useState<string[]>([]);
  const [newlyCreatedSecrets, setNewlyCreatedSecrets] = useState<string[]>([]);

  /**
   * Normalizes secret name to uppercase and validates characters
   * Secrets are always stored in uppercase
   */
  const normalizeSecretName = (name: string): string => {
    // Convert to uppercase and replace invalid characters with underscores
    return name.toUpperCase().replace(ALPHANUMERIC_WITH_HYPHENS, '_');
  };

  // Create sets of uppercase normalized names for efficient lookup
  const existingSecretsSet = new Set(existingSecrets.map(normalizeSecretName));
  const createdSecretsSet = new Set(createdSecrets.map(normalizeSecretName));

  // Normalize and deduplicate missing secrets to uppercase
  const missingSecretsMap = useMemo(() => {
    const map = new Map<string, string>(); // normalized -> original
    for (const secret of requiredSecrets) {
      const normalized = normalizeSecretName(secret);
      if (!existingSecretsSet.has(normalized) && !createdSecretsSet.has(normalized)) {
        map.set(normalized, secret);
      }
    }
    return map;
  }, [requiredSecrets, existingSecretsSet, createdSecretsSet]);

  const missingSecrets = Array.from(missingSecretsMap.keys());

  // Memoize form key to force remount when missing secrets change
  // This ensures form state resets when secrets are created (via query cache invalidation)
  const formKey = useMemo(() => missingSecrets.sort().join(','), [missingSecrets]);

  const form = useForm<SecretFormData>({
    resolver: zodResolver(SecretFormSchema),
    defaultValues: Object.fromEntries(
      missingSecrets.map((normalizedName) => {
        const originalName = missingSecretsMap.get(normalizedName) || normalizedName;
        return [normalizedName, { value: defaultValues[originalName] || defaultValues[normalizedName] || '' }];
      })
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
    // Filter out secrets that have already been created
    const secretEntries = Object.entries(data).filter(([normalizedSecretName]) => {
      return !(existingSecretsSet.has(normalizedSecretName) || createdSecretsSet.has(normalizedSecretName));
    });

    if (secretEntries.length === 0) {
      return;
    }

    const errors: Array<{ secretName: string; error: ConnectError }> = [];
    const successfulSecrets: string[] = [];

    await Promise.allSettled(
      secretEntries.map(([normalizedSecretName, { value }]) => {
        const dataPlaneRequest = create(CreateSecretRequestSchemaDataPlane, {
          id: normalizedSecretName,
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
              successfulSecrets.push(normalizedSecretName);

              // Update editor content if the original name had incorrect casing
              const originalName = missingSecretsMap.get(normalizedSecretName);
              if (originalName && originalName !== normalizedSecretName && onUpdateEditorContent) {
                onUpdateEditorContent(originalName, normalizedSecretName);
              }
            },
            onError: (error) => {
              errors.push({ secretName: normalizedSecretName, error });
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
    // Normalize the secret name to uppercase
    const normalizedName = normalizeSecretName(data.name);

    // Check if this secret already exists
    if (existingSecretsSet.has(normalizedName) || createdSecretsSet.has(normalizedName)) {
      const errorMessage = `Secret "${normalizedName}" already exists`;
      if (onError) {
        onError([errorMessage]);
      } else {
        toast.error(errorMessage);
      }
      return;
    }

    try {
      const dataPlaneRequest = create(CreateSecretRequestSchemaDataPlane, {
        id: normalizedName,
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
      setCreatedSecrets((prev) => [...prev, normalizedName]);
      setNewlyCreatedSecrets((prev) => [...prev, normalizedName]);
      // Call onSecretsCreated callback
      onSecretsCreated?.([normalizedName]);
      // Reset form
      newSecretForm.reset();

      toast.success(`Secret "${normalizedName}" created successfully`);
    } catch (error) {
      const errorMessage = formatToastErrorMessageGRPC({
        error: error as ConnectError,
        action: 'create',
        entity: `secret ${normalizedName}`,
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
              Add required secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The tool requires secrets to function properly. Create them below before proceeding.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <form key={formKey} className="space-y-3" onSubmit={form.handleSubmit(handleCreateSecrets)}>
                  {missingSecrets.map((normalizedSecretName) => {
                    const fieldName = `${normalizedSecretName}.value` as keyof SecretFormData;
                    const error = form.formState.errors[normalizedSecretName]?.value;

                    return (
                      <Field key={normalizedSecretName} data-invalid={!!error}>
                        <FieldLabel className="font-medium font-mono text-sm" htmlFor={`secret-${normalizedSecretName}`}>
                          {normalizedSecretName}
                        </FieldLabel>
                        <Input
                          id={`secret-${normalizedSecretName}`}
                          placeholder={`Enter value for ${normalizedSecretName}...`}
                          type="password"
                          {...form.register(fieldName)}
                          aria-invalid={!!error}
                          aria-describedby={error ? `secret-${normalizedSecretName}-error` : undefined}
                        />
                        {!!error && (
                          <FieldError id={`secret-${normalizedSecretName}-error`}>{error.message}</FieldError>
                        )}
                      </Field>
                    );
                  })}

                  <Button
                    className="w-full"
                    disabled={form.formState.isSubmitting}
                    type="submit"
                    variant="secondary"
                  >
                    {form.formState.isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <Text as="span">Creating...</Text>
                      </div>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Create {missingSecrets.length} secret
                        {missingSecrets.length > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </form>
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
              Add secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Display newly created secrets */}
            {newlyCreatedSecrets.length > 0 && (
              <div className="space-y-2">
                <Text className="font-medium text-muted-foreground text-sm">Created secrets:</Text>
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
              <form className="space-y-3" onSubmit={newSecretForm.handleSubmit(handleCreateNewSecret)}>
                <Field data-invalid={!!newSecretForm.formState.errors.name}>
                  <FieldLabel className="font-medium text-sm" htmlFor="new-secret-name">
                    Secret name
                  </FieldLabel>
                  <Input
                    id="new-secret-name"
                    placeholder="e.g., API_KEY, DATABASE_PASSWORD"
                    {...newSecretForm.register('name', {
                      onChange: (e) => {
                        const normalized = normalizeSecretName(e.target.value);
                        newSecretForm.setValue('name', normalized);
                      },
                    })}
                    aria-invalid={!!newSecretForm.formState.errors.name}
                    aria-describedby={
                      newSecretForm.formState.errors.name || newSecretForm.formState.isDirty
                        ? 'new-secret-name-description new-secret-name-error'
                        : 'new-secret-name-description'
                    }
                  />
                  <FieldDescription id="new-secret-name-description">
                    Secrets are stored in uppercase. Invalid characters will be replaced with underscores.
                  </FieldDescription>
                  {!!newSecretForm.formState.errors.name && (
                    <FieldError id="new-secret-name-error">{newSecretForm.formState.errors.name.message}</FieldError>
                  )}
                </Field>

                <Field data-invalid={!!newSecretForm.formState.errors.value}>
                  <FieldLabel className="font-medium text-sm" htmlFor="new-secret-value">
                    Secret Value
                  </FieldLabel>
                  <Input
                    id="new-secret-value"
                    placeholder="Enter secret value..."
                    type="password"
                    {...newSecretForm.register('value')}
                    aria-invalid={!!newSecretForm.formState.errors.value}
                    aria-describedby={newSecretForm.formState.errors.value ? 'new-secret-value-error' : undefined}
                  />
                  {!!newSecretForm.formState.errors.value && (
                    <FieldError id="new-secret-value-error">{newSecretForm.formState.errors.value.message}</FieldError>
                  )}
                </Field>

                <Button
                  className="w-full"
                  disabled={newSecretForm.formState.isSubmitting}
                  type="submit"
                  variant="secondary"
                >
                  {newSecretForm.formState.isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <Text as="span">Creating...</Text>
                    </div>
                  ) : (
                    <>
                      {newlyCreatedSecrets.length > 0 ? 'Create Another Secret' : 'Create Secret'}
                      <Plus className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
