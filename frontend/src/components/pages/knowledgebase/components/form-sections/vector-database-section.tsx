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

import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { FormLabel } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { GENERIC_SECRET_VALUE_PATTERN, SecretSelector } from 'components/ui/secret/secret-selector';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { Controller, type UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from '../../schemas';

type VectorDatabaseSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
};

export const VectorDatabaseSection: React.FC<VectorDatabaseSectionProps> = ({ form, availableSecrets }) => (
  <Card size="full">
    <CardHeader>
      <CardTitle>Vector Database</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <div>
          <FormLabel>Database Type</FormLabel>
        </div>

        <Controller
          control={form.control}
          name="postgresDsn"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>PostgreSQL DSN</FieldLabel>
              <SecretSelector
                availableSecrets={availableSecrets}
                dialogDescription="Create a new secret for your PostgreSQL connection string. The secret will be stored securely."
                dialogTitle="Create PostgreSQL DSN secret"
                emptyStateMessage="Create a secret to securely store your PostgreSQL connection string"
                onChange={field.onChange}
                placeholder="postgresql://user:password@host:port/database"
                scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                secretNamePlaceholder="e.g., POSTGRES_DSN"
                secretValueDescription="PostgreSQL connection string"
                secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                secretValuePlaceholder="postgresql://user:password@host:port/database"
                value={field.value}
              />
              <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="postgresTable"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>Table Name</FieldLabel>
              <Input {...field} placeholder="my_table" />
              <FieldDescription>
                Must start with a letter and contain only letters, numbers, and underscores
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </div>
    </CardContent>
  </Card>
);
