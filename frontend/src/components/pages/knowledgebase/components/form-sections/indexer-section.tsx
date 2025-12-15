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
  FieldSeparator,
  FieldSet,
} from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';
import { RegexPatternsField } from 'components/ui/regex/regex-patterns-field';
import { SecretSelector } from 'components/ui/secret/secret-selector';
import { TopicSelector } from 'components/ui/topic/topic-selector';
import { UserSelector } from 'components/ui/user/user-selector';
import { TableOfContents } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { Controller, type UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from '../../schemas';

type IndexerSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
};

export const IndexerSection: React.FC<IndexerSectionProps> = ({ form, availableSecrets }) => (
  <Card size="full">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <TableOfContents className="h-4 w-4" />
        <Text className="font-semibold">Indexer</Text>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>Chunking Configuration</FieldLegend>
          <FieldDescription>Configure how documents are split into chunks for embedding</FieldDescription>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Controller
              control={form.control}
              name="chunkSize"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel required>Chunk Size</FieldLabel>
                  <Input
                    placeholder="512"
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 512)}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="chunkOverlap"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel required>Chunk Overlap</FieldLabel>
                  <Input
                    placeholder="100"
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 100)}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </div>
        </FieldSet>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Topic Selection</FieldLegend>
          <FieldDescription>Choose which topics to index from your Redpanda cluster</FieldDescription>
          <Controller
            control={form.control}
            name="exactTopics"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Exact Topics</FieldLabel>
                <FieldDescription>Select existing topics from your cluster</FieldDescription>
                <TopicSelector onTopicsChange={field.onChange} selectedTopics={field.value || []} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="regexPatterns"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <RegexPatternsField
                  helperText="Add regex patterns to match multiple topics dynamically (e.g., orders-.*)"
                  label="Regex Patterns"
                  onChange={field.onChange}
                  patterns={field.value || []}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldSet>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Redpanda Credentials</FieldLegend>
          <FieldDescription>Configure authentication for accessing Redpanda topics</FieldDescription>
          <Controller
            control={form.control}
            name="redpandaUsername"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <UserSelector
                  errorMessage={fieldState.error?.message}
                  helperText="Select from existing Redpanda users"
                  isRequired
                  label="Redpanda Username"
                  onChange={field.onChange}
                  value={field.value}
                />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="redpandaPassword"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel required>Redpanda Password</FieldLabel>
                <SecretSelector
                  availableSecrets={availableSecrets}
                  customText={{
                    dialogDescription:
                      'Create a new secret for your Redpanda user password. The secret will be stored securely.',
                    secretNamePlaceholder: 'e.g., REDPANDA_PASSWORD',
                    secretValuePlaceholder: 'Enter password',
                    secretValueDescription: 'Your Redpanda user password',
                    emptyStateDescription: 'Create a secret to securely store your Redpanda password',
                  }}
                  onChange={field.onChange}
                  placeholder="Select password or create new"
                  scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                  value={field.value}
                />
                <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="redpandaSaslMechanism"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel required>SASL Mechanism</FieldLabel>
                <Select
                  onValueChange={(value) => field.onChange(Number.parseInt(value, 10))}
                  value={String(field.value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256)}>SCRAM-SHA-256</SelectItem>
                    <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512)}>SCRAM-SHA-512</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>Authentication mechanism for connecting to Redpanda</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldSet>
      </FieldGroup>
    </CardContent>
  </Card>
);
