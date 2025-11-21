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
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { GENERIC_SECRET_VALUE_PATTERN, SecretSelector } from 'components/ui/secret/secret-selector';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { UseFormReturn } from 'react-hook-form';

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
        <FormItem>
          <FormLabel>Database Type</FormLabel>
          <div className="pt-2">
            <Text>PostgreSQL</Text>
            <Text className="text-sm" variant="muted">
              Only PostgreSQL is currently supported as a vector database.
            </Text>
          </div>
        </FormItem>

        <FormField
          control={form.control}
          name="postgresDsn"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>PostgreSQL DSN</FormLabel>
              <FormControl>
                <SecretSelector
                  availableSecrets={availableSecrets}
                  dialogDescription="Create a new secret for your PostgreSQL connection string. The secret will be stored securely."
                  dialogTitle="Create PostgreSQL DSN secret"
                  emptyStateMessage="Create a secret to securely store your PostgreSQL connection string"
                  onChange={field.onChange}
                  placeholder="postgresql://user:password@host:port/database"
                  scopes={[Scope.REDPANDA_CONNECT]}
                  secretNamePlaceholder="e.g., POSTGRES_DSN"
                  secretValueDescription="PostgreSQL connection string"
                  secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                  secretValuePlaceholder="postgresql://user:password@host:port/database"
                  value={field.value}
                />
              </FormControl>
              <FormDescription>All credentials are securely stored in your Secrets Store</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="postgresTable"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Table Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="my_table" />
              </FormControl>
              <FormDescription>
                Must start with a letter and contain only letters, numbers, and underscores
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </CardContent>
  </Card>
);
