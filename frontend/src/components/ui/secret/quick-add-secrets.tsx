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
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Text } from 'components/redpanda-ui/components/typography';
import { Check, Key, Plus, X } from 'lucide-react';
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
  onSecretsCreated?: (secretNames: string[]) => void;
  enableNewSecrets?: boolean;
  onError?: (errors: string[]) => void;
  onUpdateEditorContent?: (oldName: string, newName: string) => void;
  // Seeds the editable "Secret name" input; the user can still override it.
  defaultNewSecretName?: string;
  // Renders the form(s) bare (no Card chrome) for use inside a host surface.
  inline?: boolean;
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
  onSecretsCreated,
  enableNewSecrets = false,
  onError,
  onUpdateEditorContent,
  defaultNewSecretName,
  inline = false,
}) => {
  const { mutateAsync: createSecret } = useCreateSecretMutation();
  const [createdSecrets, setCreatedSecrets] = useState<string[]>([]);
  const [newlyCreatedSecrets, setNewlyCreatedSecrets] = useState<string[]>([]);
  // Custom-secret form starts collapsed when required secrets exist so the
  // dialog focuses on the missing-secrets task.
  const [showAddAnotherForm, setShowAddAnotherForm] = useState(requiredSecrets.length === 0);

  // Secrets are always stored uppercase; invalid characters become underscores.
  const normalizeSecretName = (name: string): string =>
    name.toUpperCase().replace(ALPHANUMERIC_WITH_HYPHENS, '_');

  const existingSecretsSet = new Set(existingSecrets.map(normalizeSecretName));
  const createdSecretsSet = new Set(createdSecrets.map(normalizeSecretName));

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

  // Remounts the form (resetting its state) whenever the missing-secret set changes.
  const formKey = useMemo(() => missingSecrets.sort().join(','), [missingSecrets]);

  const form = useForm<SecretFormData>({
    resolver: zodResolver(SecretFormSchema),
    defaultValues: Object.fromEntries(missingSecrets.map((normalizedName) => [normalizedName, { value: '' }])),
  });

  const newSecretForm = useForm<NewSecretFormData>({
    resolver: zodResolver(NewSecretFormSchema),
    defaultValues: {
      name: defaultNewSecretName ? normalizeSecretName(defaultNewSecretName) : '',
      value: '',
    },
  });

  const handleCreateSecrets = async (data: SecretFormData) => {
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

    if (successfulSecrets.length > 0) {
      setCreatedSecrets((prev) => [...prev, ...successfulSecrets]);
      onSecretsCreated?.(successfulSecrets);
    }

    if (errors.length > 0) {
      const errorMessages = errors.map(({ secretName, error }) =>
        formatToastErrorMessageGRPC({ error, action: 'create', entity: `secret ${secretName}` })
      );

      if (onError) {
        onError(errorMessages);
      } else {
        for (const message of errorMessages) {
          toast.error(message);
        }
      }
    }
  };

  const handleCreateNewSecret = async (data: NewSecretFormData) => {
    const normalizedName = normalizeSecretName(data.name);

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

      setCreatedSecrets((prev) => [...prev, normalizedName]);
      setNewlyCreatedSecrets((prev) => [...prev, normalizedName]);
      onSecretsCreated?.([normalizedName]);
      newSecretForm.reset();

      toast.success(`Secret "${normalizedName}" created`);
    } catch (error) {
      const errorMessage = formatToastErrorMessageGRPC({
        error: error as ConnectError,
        action: 'create',
        entity: `secret ${normalizedName}`,
      });

      if (onError) {
        onError([errorMessage]);
      } else {
        toast.error(errorMessage);
      }
    }
  };

  if (requiredSecrets.length === 0 && !enableNewSecrets) {
    return null;
  }

  const requiredSecretsForm = (
    <>
      <Alert variant="destructive">
        <AlertTitle>Required secrets are missing</AlertTitle>
        <AlertDescription>
          The tool requires secrets to function properly. Create them below before proceeding.
        </AlertDescription>
      </Alert>

      <form key={formKey} className="space-y-4" onSubmit={form.handleSubmit(handleCreateSecrets)}>
        {missingSecrets.map((normalizedSecretName) => {
          const fieldName = `${normalizedSecretName}.value` as keyof SecretFormData;
          const error = form.formState.errors[normalizedSecretName]?.value;
          const valueId = `secret-value-${normalizedSecretName}`;

          return (
            <Field data-invalid={!!error} key={normalizedSecretName}>
              <FieldLabel className="font-medium font-mono text-sm" htmlFor={valueId}>
                {normalizedSecretName}
              </FieldLabel>
              <Input
                id={valueId}
                placeholder="Enter value"
                type="password"
                {...form.register(fieldName)}
                aria-describedby={error ? `${valueId}-error` : undefined}
                aria-invalid={!!error}
              />
              {!!error && <FieldError id={`${valueId}-error`}>{error.message}</FieldError>}
            </Field>
          );
        })}

        <Button className="w-full" disabled={form.formState.isSubmitting} type="submit" variant="primary">
          {form.formState.isSubmitting ? (
            <div className="flex items-center gap-2">
              <Spinner />
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
    </>
  );

  const newSecretFormBody = (
    <>
      {newlyCreatedSecrets.length > 0 && (
        <Alert icon={<Check />} variant="success">
          <AlertTitle>Created secrets</AlertTitle>
          <AlertDescription>
            {newlyCreatedSecrets.map((secretName) => (
              <Text className="font-mono" key={secretName} variant="bodyMedium">
                {secretName}
              </Text>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <form className="space-y-3" onSubmit={newSecretForm.handleSubmit(handleCreateNewSecret)}>
          <Field data-invalid={!!newSecretForm.formState.errors.name}>
            <FieldLabel className="font-medium text-sm" htmlFor="new-secret-name">
              Secret name
            </FieldLabel>
            <Input
              id="new-secret-name"
              placeholder="API_KEY"
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
              Secret value
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

          <Button className="w-full" disabled={newSecretForm.formState.isSubmitting} type="submit" variant="primary">
            {newSecretForm.formState.isSubmitting ? (
              <div className="flex items-center gap-2">
                <Spinner />
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
    </>
  );

  const hasRequiredSection = missingSecrets.length > 0;
  return (
    <div className="space-y-4">
      {hasRequiredSection &&
        (inline ? (
          <div className="space-y-4">{requiredSecretsForm}</div>
        ) : (
          <Card size="full" variant="elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Add required secrets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">{requiredSecretsForm}</CardContent>
          </Card>
        ))}
      {enableNewSecrets &&
        (inline ? (
          showAddAnotherForm ? (
            <div className={hasRequiredSection ? 'space-y-3 border-t pt-4' : 'space-y-4'}>
              {hasRequiredSection && (
                <div className="flex items-center justify-between gap-2">
                  <Text variant="bodyStrongMedium">Add a custom secret</Text>
                  <Button
                    aria-label="Hide custom secret form"
                    icon={<X />}
                    onClick={() => setShowAddAnotherForm(false)}
                    size="icon-xs"
                    type="button"
                    variant="secondary-ghost"
                  />
                </div>
              )}
              {newSecretFormBody}
            </div>
          ) : (
            <div className={hasRequiredSection ? 'border-t pt-4' : ''}>
              <Button
                className="w-full"
                onClick={() => setShowAddAnotherForm(true)}
                type="button"
                variant="secondary-ghost"
              >
                <Plus className="h-4 w-4" />
                Add a custom secret
              </Button>
            </div>
          )
        ) : (
          <Card size="full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Add secrets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">{newSecretFormBody}</CardContent>
          </Card>
        ))}
    </div>
  );
};
