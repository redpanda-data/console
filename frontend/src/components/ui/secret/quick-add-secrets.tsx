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
import { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Spinner } from 'components/redpanda-ui/components/spinner';
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
import { asyncEvent } from 'utils/async-event';
import { ALPHANUMERIC_WITH_HYPHENS } from 'utils/regex';
import { compareStrings, isNonEmptyString } from 'utils/string-utils';
import { formatToastErrorMessageGRPC, reportActionError } from 'utils/toast.utils';
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

// Secrets are always stored uppercase; invalid characters become underscores.
const normalizeSecretName = (name: string): string => name.toUpperCase().replace(ALPHANUMERIC_WITH_HYPHENS, '_');

type SecretNames = {
  existing: Set<string>;
  created: Set<string>;
  missing: Map<string, string>;
};

type SecretCreationCallbacks = Pick<QuickAddSecretsProps, 'onError' | 'onUpdateEditorContent'> & {
  onSecretsCreated: (names: string[]) => void;
};

type SecretFormProps = SecretCreationCallbacks & {
  names: SecretNames;
  scopes: Scope[];
};

type SecretCreationResult = { name: string; error: ConnectError | undefined };

function useCreateQuickSecret(scopes: Scope[]) {
  const { mutateAsync } = useCreateSecretMutation();
  return async (name: string, value: string): Promise<SecretCreationResult> => {
    try {
      await mutateAsync(
        create(CreateSecretRequestSchema, {
          request: create(CreateSecretRequestSchemaDataPlane, {
            id: name,
            secretData: base64ToUInt8Array(encodeBase64(value)),
            scopes,
            labels: {},
          }),
        })
      );
      return { name, error: undefined };
    } catch (error) {
      return { name, error: ConnectError.from(error) };
    }
  };
}

function secretCreationErrors(results: SecretCreationResult[]): string[] {
  return results.flatMap(({ name, error }) =>
    error === undefined ? [] : [formatToastErrorMessageGRPC({ error, action: 'create', entity: `secret ${name}` })]
  );
}

function reportSecretErrors(errors: string[], onError: QuickAddSecretsProps['onError']) {
  if (errors.length === 0) {
    return;
  }
  if (onError) {
    onError(errors);
    return;
  }
  for (const message of errors) {
    toast.error(message);
  }
}

function useSecretNames(requiredSecrets: string[], existingSecrets: string[], createdSecrets: string[]): SecretNames {
  const existing = new Set(existingSecrets.map(normalizeSecretName));
  const created = new Set(createdSecrets.map(normalizeSecretName));
  const missing = useMemo(() => {
    const map = new Map<string, string>(); // normalized -> original
    for (const secret of requiredSecrets) {
      const normalized = normalizeSecretName(secret);
      if (!(existing.has(normalized) || created.has(normalized))) {
        map.set(normalized, secret);
      }
    }
    return map;
  }, [requiredSecrets, existing, created]);
  return { existing, created, missing };
}

function RequiredSecretsForm({
  names,
  scopes,
  onSecretsCreated,
  onError,
  onUpdateEditorContent,
  inline,
}: SecretFormProps & {
  inline: boolean;
}) {
  const createSecret = useCreateQuickSecret(scopes);
  const missingSecrets = Array.from(names.missing.keys());
  // Remount the form DOM when the missing-secret set changes, retaining registered retry values.
  const formKey = useMemo(() => missingSecrets.toSorted(compareStrings).join(','), [missingSecrets]);
  const form = useForm<SecretFormData>({
    resolver: zodResolver(SecretFormSchema),
    defaultValues: Object.fromEntries(missingSecrets.map((name) => [name, { value: '' }])),
  });
  const handleSubmit = async (data: SecretFormData) => {
    // These independent creates run concurrently; every named result is awaited and reported.
    const results = await Promise.all(
      Object.entries(data)
        .filter(([name]) => !(names.existing.has(name) || names.created.has(name)))
        .map(([name, { value }]) => createSecret(name, value))
    );
    const successful = results.filter(({ error }) => error === undefined).map(({ name }) => name);
    for (const name of successful) {
      const original = names.missing.get(name);
      if (isNonEmptyString(original) && original !== name) {
        onUpdateEditorContent?.(original, name);
      }
    }
    if (successful.length > 0) {
      onSecretsCreated(successful);
    }
    reportSecretErrors(secretCreationErrors(results), onError);
  };
  const content = (
    <>
      <Alert variant="destructive">
        <AlertTitle>Required secrets are missing</AlertTitle>
        <AlertDescription>
          The tool requires secrets to function properly. Create them below before proceeding.
        </AlertDescription>
      </Alert>
      <form
        className="space-y-4"
        key={formKey}
        onSubmit={asyncEvent(form.handleSubmit(handleSubmit), reportActionError)}
      >
        {missingSecrets.map((name) => {
          const error = form.formState.errors[name]?.value;
          const valueId = `secret-value-${name}`;
          return (
            <Field data-invalid={!!error} key={name}>
              <FieldLabel htmlFor={valueId}>
                <span className="font-mono text-body font-medium">{name}</span>
              </FieldLabel>
              <Input
                id={valueId}
                placeholder="Enter value"
                type="password"
                {...form.register(`${name}.value`)}
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
              <span className="text-body">Creating...</span>
            </div>
          ) : (
            <>
              <Plus className="size-4" />
              Create {missingSecrets.length} secret{missingSecrets.length > 1 ? 's' : ''}
            </>
          )}
        </Button>
      </form>
    </>
  );
  return inline ? (
    <div className="space-y-4">{content}</div>
  ) : (
    <Card size="full" variant="elevated">
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Key className="size-4" />
            Add required secrets
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent space="md">{content}</CardContent>
    </Card>
  );
}

type NewSecretFormProps = SecretFormProps & Pick<QuickAddSecretsProps, 'defaultNewSecretName'>;

type NewSecretSubmission = Pick<NewSecretFormProps, 'names' | 'onError'> & {
  createSecret: ReturnType<typeof useCreateQuickSecret>;
};

async function submitNewSecret(data: NewSecretFormData, { names, onError, createSecret }: NewSecretSubmission) {
  const name = normalizeSecretName(data.name);
  if (names.existing.has(name) || names.created.has(name)) {
    reportSecretErrors([`Secret "${name}" already exists`], onError);
    return;
  }
  const result = await createSecret(name, data.value);
  reportSecretErrors(secretCreationErrors([result]), onError);
  return result.error === undefined ? name : undefined;
}

function useNewSecretForm({ names, scopes, onSecretsCreated, onError, defaultNewSecretName }: NewSecretFormProps) {
  const createSecret = useCreateQuickSecret(scopes);
  const [newlyCreatedSecrets, setNewlyCreatedSecrets] = useState<string[]>([]);
  const form = useForm<NewSecretFormData>({
    resolver: zodResolver(NewSecretFormSchema),
    defaultValues: {
      name: isNonEmptyString(defaultNewSecretName) ? normalizeSecretName(defaultNewSecretName) : '',
      value: '',
    },
  });
  const onSubmit = async (data: NewSecretFormData) => {
    const name = await submitNewSecret(data, { names, onError, createSecret });
    if (name === undefined) {
      return;
    }
    setNewlyCreatedSecrets((prev) => [...prev, name]);
    onSecretsCreated([name]);
    form.reset();
    toast.success(`Secret "${name}" created`);
  };
  return { form, newlyCreatedSecrets, onSubmit };
}

function NewSecretFormBody({ form, newlyCreatedSecrets, onSubmit }: ReturnType<typeof useNewSecretForm>) {
  return (
    <>
      {newlyCreatedSecrets.length > 0 && (
        <Alert icon={<Check />} variant="success">
          <AlertTitle>Created secrets</AlertTitle>
          <AlertDescription>
            {newlyCreatedSecrets.map((name) => (
              <div className="font-mono text-body" key={name}>
                {name}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <form className="space-y-3" onSubmit={asyncEvent(form.handleSubmit(onSubmit), reportActionError)}>
          <Field data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="new-secret-name">
              <span className="text-body font-medium">Secret name</span>
            </FieldLabel>
            <Input
              id="new-secret-name"
              placeholder="API_KEY"
              {...form.register('name', {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  form.setValue('name', normalizeSecretName(event.target.value));
                },
              })}
              aria-describedby={
                form.formState.errors.name || form.formState.isDirty
                  ? 'new-secret-name-description new-secret-name-error'
                  : 'new-secret-name-description'
              }
              aria-invalid={!!form.formState.errors.name}
            />
            <FieldDescription id="new-secret-name-description">
              Secrets are stored in uppercase. Invalid characters will be replaced with underscores.
            </FieldDescription>
            {!!form.formState.errors.name && (
              <FieldError id="new-secret-name-error">{form.formState.errors.name.message}</FieldError>
            )}
          </Field>
          <Field data-invalid={!!form.formState.errors.value}>
            <FieldLabel htmlFor="new-secret-value">
              <span className="text-body font-medium">Secret value</span>
            </FieldLabel>
            <Input
              id="new-secret-value"
              placeholder="Enter secret value..."
              type="password"
              {...form.register('value')}
              aria-describedby={form.formState.errors.value ? 'new-secret-value-error' : undefined}
              aria-invalid={!!form.formState.errors.value}
            />
            {!!form.formState.errors.value && (
              <FieldError id="new-secret-value-error">{form.formState.errors.value.message}</FieldError>
            )}
          </Field>
          <Button className="w-full" disabled={form.formState.isSubmitting} type="submit" variant="primary">
            {form.formState.isSubmitting ? (
              <div className="flex items-center gap-2">
                <Spinner />
                <span className="text-body">Creating...</span>
              </div>
            ) : (
              <>
                {newlyCreatedSecrets.length > 0 ? 'Create Another Secret' : 'Create Secret'}
                <Plus className="size-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </>
  );
}

function InlineCustomSecrets({
  expanded,
  onExpandedChange,
  hasRequiredSection,
  children,
}: React.PropsWithChildren<{
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  hasRequiredSection: boolean;
}>) {
  if (!expanded) {
    return (
      <div className={hasRequiredSection ? 'border-t pt-4' : ''}>
        <Button className="w-full" onClick={() => onExpandedChange(true)} type="button" variant="ghost">
          <Plus className="size-4" />
          Add a custom secret
        </Button>
      </div>
    );
  }
  return (
    <div className={hasRequiredSection ? 'space-y-3 border-t pt-4' : 'space-y-4'}>
      {hasRequiredSection && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-body font-medium">Add a custom secret</div>
          <Button
            aria-label="Hide custom secret form"
            icon={<X />}
            onClick={() => onExpandedChange(false)}
            size="icon-xs"
            type="button"
            variant="ghost"
          />
        </div>
      )}
      {children}
    </div>
  );
}

function CustomSecretsSection({
  inline,
  initiallyExpanded,
  ...props
}: NewSecretFormProps & {
  inline: boolean;
  initiallyExpanded: boolean;
}) {
  const state = useNewSecretForm(props);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const body = <NewSecretFormBody {...state} />;
  if (inline) {
    return (
      <InlineCustomSecrets
        expanded={expanded}
        hasRequiredSection={props.names.missing.size > 0}
        onExpandedChange={setExpanded}
      >
        {body}
      </InlineCustomSecrets>
    );
  }
  return (
    <Card size="full">
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Key className="size-4" />
            Add secrets
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent space="md">{body}</CardContent>
    </Card>
  );
}

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
  const [createdSecrets, setCreatedSecrets] = useState<string[]>([]);
  const names = useSecretNames(requiredSecrets, existingSecrets, createdSecrets);
  const handleCreated = (successful: string[]) => {
    setCreatedSecrets((prev) => [...prev, ...successful]);
    onSecretsCreated?.(successful);
  };
  if (requiredSecrets.length === 0 && !enableNewSecrets) {
    return null;
  }
  return (
    <div className="space-y-4">
      {names.missing.size > 0 && (
        <RequiredSecretsForm
          inline={inline}
          names={names}
          onError={onError}
          onSecretsCreated={handleCreated}
          onUpdateEditorContent={onUpdateEditorContent}
          scopes={scopes}
        />
      )}
      {enableNewSecrets && (
        <CustomSecretsSection
          defaultNewSecretName={defaultNewSecretName}
          initiallyExpanded={requiredSecrets.length === 0}
          inline={inline}
          names={names}
          onError={onError}
          onSecretsCreated={handleCreated}
          scopes={scopes}
        />
      )}
    </div>
  );
};
