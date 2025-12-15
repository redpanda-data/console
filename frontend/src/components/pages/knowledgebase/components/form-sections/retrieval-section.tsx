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
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
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
import { Link, Text } from 'components/redpanda-ui/components/typography';
import { RerankerModelSelect } from 'components/ui/ai/reranker-model-select';
import { SecretSelector } from 'components/ui/secret/secret-selector';
import { ExternalLink, Shuffle } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { COHERE_RERANKER_MODELS } from '../../constants';
import type { KnowledgeBaseCreateFormValues } from '../../schemas';

type RetrievalSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
  rerankerEnabled: boolean;
};

export const RetrievalSection: React.FC<RetrievalSectionProps> = ({ form, availableSecrets, rerankerEnabled }) => (
  <Card size="full">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Shuffle className="h-4 w-4" />
        <Text className="font-semibold">Retrieval</Text>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>Retrieval Configuration</FieldLegend>
          <FieldDescription>Configure how documents are retrieved from the knowledge base</FieldDescription>
          <Controller
            control={form.control}
            name="rerankerEnabled"
            render={({ field }) => (
              <div className="flex flex-row items-start space-x-3 space-y-0">
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                <div className="space-y-1 leading-none">
                  <FieldLabel>Enable Reranker (Recommended)</FieldLabel>
                  <FieldDescription>
                    Reranker improves search quality by reordering retrieved documents based on relevance.
                  </FieldDescription>
                </div>
              </div>
            )}
          />
        </FieldSet>

        {rerankerEnabled && (
          <>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Reranker Configuration</FieldLegend>
              <FieldDescription>Configure the reranking model and credentials</FieldDescription>
              <Controller
                control={form.control}
                name="rerankerModel"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel required>Model</FieldLabel>
                    <RerankerModelSelect
                      models={COHERE_RERANKER_MODELS}
                      onValueChange={field.onChange}
                      value={field.value || ''}
                    />
                    <FieldDescription>
                      See{' '}
                      <Link
                        className="inline-flex items-center gap-1"
                        href="https://docs.cohere.com/docs/rerank"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Cohere rerank models <ExternalLink className="h-3 w-3" />
                      </Link>{' '}
                      for available models.
                    </FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="rerankerApiKey"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel required>API Key</FieldLabel>
                    <SecretSelector
                      availableSecrets={availableSecrets}
                      customText={{
                        dialogDescription:
                          'Create a new secret for your Cohere API key for reranking. The secret will be stored securely.',
                        secretNamePlaceholder: 'e.g., COHERE_API_KEY',
                        secretValuePlaceholder: 'Enter Cohere API key',
                        secretValueDescription: 'Your Cohere API key',
                        emptyStateDescription: 'Create a secret to securely store your Cohere API key',
                      }}
                      onChange={field.onChange}
                      placeholder="Select Cohere API key from secrets"
                      scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                      value={field.value || ''}
                    />
                    <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldSet>
          </>
        )}
      </FieldGroup>
    </CardContent>
  </Card>
);
