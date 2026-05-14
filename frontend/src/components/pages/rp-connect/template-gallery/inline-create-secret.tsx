/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Form, SimpleFormField } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { KeyRound, Plus } from 'lucide-react';
import { CreateSecretRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  CreateSecretRequestSchema as CreateSecretRequestSchemaDataPlane,
  type Scope,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useForm } from 'react-hook-form';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { ALPHANUMERIC_WITH_HYPHENS } from 'utils/regex';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';

const SECRET_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

const normalizeSecretName = (name: string) => name.toUpperCase().replace(ALPHANUMERIC_WITH_HYPHENS, '_');

const FormSchema = z.object({
  name: z
    .string()
    .min(1, 'Secret name is required')
    .max(255, 'Secret name must be fewer than 255 characters')
    .regex(SECRET_NAME_PATTERN, 'Must start with a letter and contain only letters, numbers, and underscores'),
  value: z.string().min(1, 'Secret value is required'),
});

type FormValues = z.infer<typeof FormSchema>;

export type InlineCreateSecretProps = {
  /** Pre-fills the secret-name input. */
  suggestedName?: string;
  /** Already-existing secret names — used to reject duplicates locally before hitting the API. */
  existingSecrets: string[];
  scopes: Scope[];
  onCreated: (name: string) => void;
};

export const InlineCreateSecret = ({ suggestedName, existingSecrets, scopes, onCreated }: InlineCreateSecretProps) => {
  const { mutateAsync: createSecret, isPending } = useCreateSecretMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: suggestedName ?? '',
      value: '',
    },
    mode: 'onBlur',
  });

  const existingSet = new Set(existingSecrets.map(normalizeSecretName));

  const handleSubmit = form.handleSubmit(async (values) => {
    const normalized = normalizeSecretName(values.name);

    if (existingSet.has(normalized)) {
      form.setError('name', { message: `A secret named "${normalized}" already exists` });
      return;
    }

    try {
      await createSecret(
        create(CreateSecretRequestSchema, {
          request: create(CreateSecretRequestSchemaDataPlane, {
            id: normalized,
            secretData: base64ToUInt8Array(encodeBase64(values.value)),
            scopes,
            labels: {},
          }),
        })
      );
      toast.success(`Secret "${normalized}" created`);
      onCreated(normalized);
    } catch (error) {
      toast.error(
        formatToastErrorMessageGRPC({
          error: error as ConnectError,
          action: 'create',
          entity: `secret ${normalized}`,
        })
      );
    }
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" data-testid="inline-create-secret" onSubmit={handleSubmit}>
        {suggestedName ? (
          <Alert icon={<KeyRound />} variant="warning">
            <AlertTitle>This template needs a secret</AlertTitle>
            <AlertDescription>
              {/* AlertDescription uses `display: grid` — wrap everything in a single child so the
                  inline text fragments and the suggested-name span flow on the same line instead
                  of each becoming their own grid row. */}
              <p className="text-pretty">
                We've suggested <span className="font-mono font-semibold">{suggestedName}</span> — feel free to adjust
                the name.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        <SimpleFormField
          control={form.control}
          description="Stored uppercased. Invalid characters are replaced with underscores."
          label="Secret name"
          name="name"
          required
        >
          {(field) => (
            <Input
              data-testid="inline-create-secret-name"
              onChange={field.onChange}
              placeholder="MY_SECRET"
              value={field.value ?? ''}
            />
          )}
        </SimpleFormField>

        <SimpleFormField control={form.control} label="Secret value" name="value" required>
          {(field) => (
            <Input
              data-testid="inline-create-secret-value"
              onChange={field.onChange}
              placeholder="Enter the secret value..."
              type="password"
              value={field.value ?? ''}
            />
          )}
        </SimpleFormField>

        <Button
          className="self-end"
          data-testid="inline-create-secret-submit"
          disabled={isPending}
          icon={<Plus />}
          type="submit"
          variant="primary"
        >
          {isPending ? 'Creating...' : 'Create secret'}
        </Button>
      </form>
    </Form>
  );
};
