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

import { Database } from 'lucide-react';

import { Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import type { KnowledgeBase } from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { FormControl, FormItem, FormLabel } from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Text } from '../../../redpanda-ui/components/typography';
import { GENERIC_SECRET_VALUE_PATTERN, SecretSelector } from '../../../ui/secret/secret-selector';

type VectorDatabaseSectionProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
  postgresDsn: string;
  availableSecrets: Array<{ id: string; name: string }>;
  onPostgresDsnChange: (secretId: string) => void;
};

/**
 * Regex pattern to extract secret name from template string: ${secrets.SECRET_NAME}
 */
const SECRET_TEMPLATE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

/**
 * Extracts the secret name from the template string format: ${secrets.SECRET_NAME} -> SECRET_NAME
 */
const extractSecretName = (secretTemplate: string): string => {
  if (!secretTemplate) {
    return '';
  }
  const match = secretTemplate.match(SECRET_TEMPLATE_REGEX);
  return match ? match[1] : secretTemplate; // Return original if no match (in case it's already just the ID)
};

export const VectorDatabaseSection = ({
  knowledgeBase,
  isEditMode,
  postgresDsn,
  availableSecrets,
  onPostgresDsnChange,
}: VectorDatabaseSectionProps) => {
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
            <FormItem>
              <FormLabel required>PostgreSQL DSN</FormLabel>
              <p className="mb-2 text-muted-foreground text-sm">
                All credentials are securely stored in your Secrets Store
              </p>
              <FormControl>
                <SecretSelector
                  availableSecrets={availableSecrets}
                  dialogDescription="Create a new secret for your PostgreSQL connection string"
                  dialogTitle="Create PostgreSQL DSN Secret"
                  onChange={onPostgresDsnChange}
                  placeholder="Select PostgreSQL DSN secret"
                  scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                  secretNamePlaceholder="e.g., POSTGRES_DSN"
                  secretValueDescription="PostgreSQL connection string (e.g., postgresql://user:password@host:port/database)"
                  secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                  secretValuePlaceholder="postgresql://user:password@host:port/database"
                  value={postgresDsn}
                />
              </FormControl>
            </FormItem>
          ) : (
            <div className="space-y-2">
              <FormLabel>PostgreSQL DSN</FormLabel>
              <p className="text-muted-foreground text-sm">All credentials are securely stored in your Secrets Store</p>
              <Input disabled value={extractSecretName(postgres?.dsn || '') || 'Not configured'} />
            </div>
          )}

          {postgres && (
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
