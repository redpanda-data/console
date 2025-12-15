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

import CohereLogo from 'assets/cohere.svg';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { EmbeddingModelSelect } from 'components/ui/ai/embedding-model-select';
import { SecretSelector } from 'components/ui/secret/secret-selector';
import { Combine, ExternalLink } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { COHERE_MODELS, detectEmbeddingProvider, OPENAI_MODELS } from '../../constants';
import type { KnowledgeBaseCreateFormValues } from '../../schemas';

type EmbeddingGeneratorSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
  embeddingProvider: 'openai' | 'cohere';
};

export const EmbeddingGeneratorSection: React.FC<EmbeddingGeneratorSectionProps> = ({
  form,
  availableSecrets,
  embeddingProvider,
}) => (
  <Card size="full">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Combine className="h-4 w-4" />
        <Text className="font-semibold">Embedding Generator</Text>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <Controller
          control={form.control}
          name="embeddingModel"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>Model</FieldLabel>
              <EmbeddingModelSelect
                models={{
                  openai: OPENAI_MODELS,
                  cohere: COHERE_MODELS,
                }}
                onValueChange={(value) => {
                  field.onChange(value);
                  // Auto-detect and set provider based on selected model
                  const provider = detectEmbeddingProvider(value);
                  if (provider) {
                    form.setValue('embeddingProvider', provider);
                  }
                  // Set dimensions based on selected model
                  const allModels = [...OPENAI_MODELS, ...COHERE_MODELS];
                  const selectedModel = allModels.find((m) => m.name === value);
                  if (selectedModel) {
                    form.setValue('embeddingDimensions', selectedModel.dimensions);
                  }
                }}
                value={field.value}
              />
              {embeddingProvider === 'openai' && (
                <FieldDescription>
                  See{' '}
                  <a
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                    href="https://platform.openai.com/docs/guides/embeddings#embedding-models"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    OpenAI embedding models <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  for available models and dimensions.
                </FieldDescription>
              )}
              {embeddingProvider === 'cohere' && (
                <FieldDescription>
                  See{' '}
                  <a
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                    href="https://docs.cohere.com/docs/cohere-embed"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Cohere embedding models <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  for available models and dimensions.
                </FieldDescription>
              )}
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="embeddingDimensions"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>Dimensions</FieldLabel>
              <Input
                placeholder="1536"
                type="number"
                {...field}
                onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 1536)}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {embeddingProvider === 'openai' && (
          <Controller
            control={form.control}
            name="openaiApiKey"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel required>API Key</FieldLabel>
                <SecretSelector
                  availableSecrets={availableSecrets}
                  customText={{
                    dialogDescription:
                      'Create a new secret for your OpenAI API key. The secret will be stored securely.',
                    secretNamePlaceholder: 'e.g., OPENAI_API_KEY',
                    secretValuePlaceholder: 'Enter OpenAI API key (e.g., sk-...)',
                    secretValueDescription: 'Your OpenAI API key',
                    emptyStateDescription: 'Create a secret to securely store your OpenAI API key',
                  }}
                  onChange={field.onChange}
                  placeholder="Select OpenAI API key from secrets"
                  scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                  value={field.value || ''}
                />
                <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}

        {embeddingProvider === 'cohere' && (
          <Controller
            control={form.control}
            name="cohereApiKey"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center gap-2">
                  <img alt="Cohere" className="h-4 w-4" src={CohereLogo} />
                  <Text className="font-medium text-sm">Cohere Configuration</Text>
                </div>
                <FieldLabel required>API Key</FieldLabel>
                <SecretSelector
                  availableSecrets={availableSecrets}
                  customText={{
                    dialogDescription:
                      'Create a new secret for your Cohere API key. The secret will be stored securely.',
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
        )}
      </div>
    </CardContent>
  </Card>
);
