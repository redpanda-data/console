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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { SecretSelector } from 'components/ui/secret/secret-selector';
import { formatSecretTemplate } from 'components/ui/secret/secret-utils';
import { Database } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { Controller, type UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from './schemas';

type VectorDatabaseSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
};

export const VectorDatabaseSection: React.FC<VectorDatabaseSectionProps> = ({ form, availableSecrets }) => (
  <Card size="full">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Database className="h-4 w-4" />
        <Text className="font-semibold">Vector Database</Text>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>PostgreSQL Configuration</FieldLegend>
          <FieldDescription>Configure your PostgreSQL database for vector storage</FieldDescription>
          <Controller
            control={form.control}
            name="postgresDsn"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel required>PostgreSQL DSN</FieldLabel>
                <SecretSelector
                  availableSecrets={availableSecrets}
                  customText={{
                    dialogDescription:
                      'Create a new secret for your PostgreSQL connection string. The secret will be stored securely.',
                    secretNamePlaceholder: 'e.g., POSTGRES_DSN',
                    secretValuePlaceholder: 'postgresql://user:password@host:port/database',
                    secretValueDescription: 'PostgreSQL connection string',
                    emptyStateDescription: 'Create a secret to securely store your PostgreSQL connection string',
                  }}
                  onChange={(secretId) => field.onChange(formatSecretTemplate(secretId))}
                  placeholder="postgresql://user:password@host:port/database"
                  scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                  value={field.value}
                />
                <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
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
                {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldSet>
      </FieldGroup>
    </CardContent>
  </Card>
);
