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

import { RegexPatternsField } from 'components/ui/regex/regex-patterns-field';
import { TableOfContents } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';

import { Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { SASLMechanism } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import type {
  KnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useListSecretsQuery } from '../../../../react-query/api/secret';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../../redpanda-ui/components/field';
import { FormItem, FormLabel } from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../redpanda-ui/components/select';
import { Text } from '../../../redpanda-ui/components/typography';
import { SecretSelector } from '../../../ui/secret/secret-selector';
import { TopicSelector } from '../../../ui/topic/topic-selector';
import { UserSelector } from '../../../ui/user/user-selector';
import { isRegexPattern, stripRegexPrefix } from '../schemas';
import { extractSecretName, formatSecretTemplate } from '../utils/secret-utils';

type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
  indexer?: KnowledgeBaseUpdate['indexer'] & {
    exactTopics?: string[];
    regexPatterns?: string[];
  };
};

type IndexerSectionProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
};

export const IndexerSection = ({ knowledgeBase, isEditMode }: IndexerSectionProps) => {
  const { control } = useFormContext<KnowledgeBaseUpdateForm>();
  const { data: secretsData } = useListSecretsQuery();

  const availableSecrets =
    secretsData?.secrets
      ?.filter((secret) => secret !== undefined)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      })) || [];

  const indexer = knowledgeBase.indexer;

  return (
    <Card className="px-0 py-0" size="full">
      <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2">
          <TableOfContents className="h-4 w-4" />
          <Text className="font-semibold">Indexer</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col gap-4">
          {isEditMode ? (
            <>
              <div className="flex gap-4">
                <Controller
                  control={control}
                  name="indexer.chunkSize"
                  render={({ field, fieldState }) => (
                    <Field className="flex-1" data-invalid={fieldState.invalid}>
                      <FieldLabel required>Chunk Size</FieldLabel>
                      <Input
                        {...field}
                        min={1}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        type="number"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="indexer.chunkOverlap"
                  render={({ field, fieldState }) => (
                    <Field className="flex-1" data-invalid={fieldState.invalid}>
                      <FieldLabel required>Chunk Overlap</FieldLabel>
                      <Input
                        {...field}
                        min={0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        type="number"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </div>

              <Controller
                control={control}
                name="indexer.exactTopics"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Exact Topics</FieldLabel>
                    <FieldDescription>Select existing topics from your cluster</FieldDescription>
                    <TopicSelector onTopicsChange={field.onChange} selectedTopics={field.value || []} />
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="indexer.regexPatterns"
                render={({ field }) => (
                  <Field>
                    <RegexPatternsField
                      helperText="Match topics dynamically using regex patterns"
                      label="Regex Patterns"
                      onChange={field.onChange}
                      patterns={field.value || []}
                    />
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="indexer.inputTopics"
                render={({ fieldState }) => (
                  <>
                    {fieldState.invalid && (
                      <Field data-invalid={true}>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  </>
                )}
              />

              <Controller
                control={control}
                name="indexer.redpandaUsername"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <UserSelector
                      errorMessage={fieldState.error?.message}
                      helperText="Select from existing Redpanda users"
                      isRequired
                      label="Redpanda Username"
                      onChange={field.onChange}
                      value={field.value || ''}
                    />
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="indexer.redpandaPassword"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel required>Redpanda Password</FieldLabel>
                    <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                    <SecretSelector
                      availableSecrets={availableSecrets}
                      customText={{
                        dialogDescription: 'Create a new secret for your Redpanda password',
                        secretNamePlaceholder: 'e.g., REDPANDA_PASSWORD',
                        secretValuePlaceholder: 'Enter password',
                        secretValueDescription: 'Your Redpanda user password',
                        emptyStateDescription: 'Create a secret to securely store your Redpanda password',
                      }}
                      onChange={(secretId) => {
                        field.onChange(formatSecretTemplate(secretId));
                      }}
                      placeholder="Enter password or select from secrets"
                      scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                      value={extractSecretName(field.value || '')}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="indexer.redpandaSaslMechanism"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel required>SASL Mechanism</FieldLabel>
                    <Select
                      onValueChange={(value) => field.onChange(Number(value))}
                      value={String(field.value || SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256)}>
                          SCRAM-SHA-256
                        </SelectItem>
                        <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512)}>
                          SCRAM-SHA-512
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </>
          ) : (
            <>
              <div className="flex gap-4">
                <FormItem className="flex-1">
                  <FormLabel>Chunk Size</FormLabel>
                  <Input disabled type="number" value={indexer?.chunkSize || 512} />
                </FormItem>
                <FormItem className="flex-1">
                  <FormLabel>Chunk Overlap</FormLabel>
                  <Input disabled type="number" value={indexer?.chunkOverlap || 100} />
                </FormItem>
              </div>

              {(() => {
                const allTopics = indexer?.inputTopics || [];
                // Split topics based on 'regex:' prefix
                const exact = allTopics.filter((t) => !isRegexPattern(t));
                const regex = allTopics.filter((t) => isRegexPattern(t)).map((t) => stripRegexPrefix(t)); // Strip prefix for display

                return (
                  <>
                    {exact.length > 0 && (
                      <FormItem>
                        <FormLabel>Exact Topics</FormLabel>
                        <TopicSelector
                          isReadOnly={true}
                          onTopicsChange={() => {
                            // Read-only field, no action needed
                          }}
                          selectedTopics={exact}
                        />
                      </FormItem>
                    )}

                    {regex.length > 0 && (
                      <RegexPatternsField
                        helperText="Patterns matching topics dynamically"
                        isReadOnly={true}
                        label="Regex Patterns"
                        onChange={() => {
                          // Read-only field, no action needed
                        }}
                        patterns={regex}
                      />
                    )}
                  </>
                );
              })()}

              <UserSelector
                helperText="Select from existing Redpanda users"
                isDisabled
                isRequired
                label="Redpanda Username"
                onChange={() => {
                  // Read-only field, no action needed
                }}
                value={indexer?.redpandaUsername || ''}
              />

              <div className="space-y-2">
                <FormLabel>Redpanda Password</FormLabel>
                <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                <Input disabled value={extractSecretName(indexer?.redpandaPassword || '') || 'Not configured'} />
              </div>

              <FormItem>
                <FormLabel>SASL Mechanism</FormLabel>
                <Input
                  disabled
                  value={
                    indexer?.redpandaSaslMechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512
                      ? 'SCRAM-SHA-512'
                      : 'SCRAM-SHA-256'
                  }
                />
              </FormItem>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
