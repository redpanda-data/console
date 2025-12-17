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

import { create } from '@bufbuild/protobuf';
import { Database } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';

import { Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import type {
  KnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import {
  KnowledgeBaseUpdate_VectorDatabase_PostgresSchema,
  KnowledgeBaseUpdate_VectorDatabaseSchema,
} from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useListSecretsQuery } from '../../../../react-query/api/secret';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../../redpanda-ui/components/field';
import { FormItem, FormLabel } from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Text } from '../../../redpanda-ui/components/typography';
import { SecretSelector } from '../../../ui/secret/secret-selector';
import { extractSecretName, formatSecretTemplate } from '../../../ui/secret/secret-utils';

type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
  indexer?: KnowledgeBaseUpdate['indexer'] & {
    exactTopics?: string[];
    regexPatterns?: string[];
  };
};

type VectorDatabaseSectionProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
};

export const VectorDatabaseSection = ({ knowledgeBase, isEditMode }: VectorDatabaseSectionProps) => {
  const { control } = useFormContext<KnowledgeBaseUpdateForm>();
  const { data: secretsData } = useListSecretsQuery();

  const availableSecrets =
    secretsData?.secrets
      ?.filter((secret) => secret !== undefined)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      })) || [];

  const postgres =
    knowledgeBase.vectorDatabase?.vectorDatabase.case === 'postgres'
      ? knowledgeBase.vectorDatabase.vectorDatabase.value
      : null;

  return (
    <Card className="px-0 py-0" size="full">
      <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          <Text className="font-semibold">Vector Database</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col gap-4">
          {isEditMode ? (
            <Controller
              control={control}
              name="vectorDatabase"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel required>PostgreSQL DSN</FieldLabel>
                  <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                  <SecretSelector
                    availableSecrets={availableSecrets}
                    customText={{
                      dialogDescription: 'Create a new secret for your PostgreSQL connection string',
                      secretNamePlaceholder: 'e.g., POSTGRES_DSN',
                      secretValuePlaceholder: 'postgresql://user:password@host:port/database',
                      secretValueDescription:
                        'PostgreSQL connection string (e.g., postgresql://user:password@host:port/database)',
                      emptyStateDescription: 'Create a secret to securely store your PostgreSQL connection string',
                    }}
                    onChange={(secretId) => {
                      // Rebuild discriminated union with new secret
                      field.onChange(
                        create(KnowledgeBaseUpdate_VectorDatabaseSchema, {
                          vectorDatabase: {
                            case: 'postgres',
                            value: create(KnowledgeBaseUpdate_VectorDatabase_PostgresSchema, {
                              dsn: formatSecretTemplate(secretId),
                            }),
                          },
                        })
                      );
                    }}
                    placeholder="Select PostgreSQL DSN secret"
                    scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                    value={extractSecretName(
                      field.value?.vectorDatabase.case === 'postgres' ? field.value.vectorDatabase.value.dsn : ''
                    )}
                  />
                  {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          ) : (
            <div className="space-y-2">
              <FormLabel>PostgreSQL DSN</FormLabel>
              <p className="text-muted-foreground text-sm">All credentials are securely stored in your Secrets Store</p>
              <Input disabled value={extractSecretName(postgres?.dsn || '') || 'Not configured'} />
            </div>
          )}

          {Boolean(postgres) && (
            <FormItem>
              <FormLabel>Table Name</FormLabel>
              <p className="mb-2 text-muted-foreground text-sm">Table name cannot be changed after creation.</p>
              <Input disabled value={postgres.table} />
            </FormItem>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
