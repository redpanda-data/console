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
import { CohereLogo } from 'assets/connectors/logos/cohere-logo';
import { OpenAILogo } from 'assets/connectors/logos/openai-logo';
import { Combine, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  type KnowledgeBase,
  type KnowledgeBaseUpdate,
  KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema,
  KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema,
  KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema,
} from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useListSecretsQuery } from '../../../../react-query/api/secret';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../../redpanda-ui/components/field';
import { FormItem, FormLabel } from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Heading, Link, Text } from '../../../redpanda-ui/components/typography';
import { COHERE_MODELS, OPENAI_MODELS } from '../../../ui/ai/ai-constants';
import { EmbeddingModelSelect } from '../../../ui/ai/embedding-model-select';
import { SecretSelector } from '../../../ui/secret/secret-selector';
import { extractSecretName, formatSecretTemplate } from '../../../ui/secret/secret-utils';

type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
  indexer?: KnowledgeBaseUpdate['indexer'] & {
    exactTopics?: string[];
    regexPatterns?: string[];
  };
};

type EmbeddingGeneratorSectionProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
};

export const EmbeddingGeneratorSection = ({ knowledgeBase, isEditMode }: EmbeddingGeneratorSectionProps) => {
  const { watch, setValue, control } = useFormContext<KnowledgeBaseUpdateForm>();
  const formData = watch();
  const { data: secretsData } = useListSecretsQuery();

  const availableSecrets =
    secretsData?.secrets
      ?.filter((secret) => secret !== undefined)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      })) || [];

  const embeddingGen = knowledgeBase.embeddingGenerator;

  // Ensure embedding provider is always properly initialized when entering edit mode
  useEffect(() => {
    if (isEditMode && formData.embeddingGenerator) {
      const hasProvider = formData.embeddingGenerator.provider?.provider.case;

      if (!hasProvider && embeddingGen?.provider?.provider.case) {
        // Provider structure exists in server data but not in form - re-initialize
        const provider = embeddingGen.provider.provider.case;
        const apiKey = embeddingGen.provider.provider.value.apiKey || '';

        if (provider === 'openai') {
          setValue(
            'embeddingGenerator.provider',
            create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
              provider: {
                case: 'openai',
                value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema, {
                  apiKey,
                }),
              },
            }),
            { shouldDirty: false }
          );
        } else if (provider === 'cohere') {
          setValue(
            'embeddingGenerator.provider',
            create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
              provider: {
                case: 'cohere',
                value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema, {
                  baseUrl: embeddingGen.provider.provider.value.baseUrl || '',
                  apiKey,
                }),
              },
            }),
            { shouldDirty: false }
          );
        }
      }
    }
  }, [isEditMode, formData.embeddingGenerator, embeddingGen, setValue]);

  return (
    <Card className="px-0 py-0" size="full">
      <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2">
          <Combine className="h-4 w-4" />
          <Text className="font-semibold">Embedding Generator</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col gap-4">
          {isEditMode ? (
            <>
              <FormItem>
                <FormLabel>Model</FormLabel>
                <p className="mb-2 text-muted-foreground text-sm">Model cannot be changed after creation.</p>
                <EmbeddingModelSelect
                  disabled
                  models={{
                    openai: OPENAI_MODELS,
                    cohere: COHERE_MODELS,
                  }}
                  onValueChange={() => {
                    // Disabled - no action
                  }}
                  value={embeddingGen?.model || ''}
                />
              </FormItem>

              <FormItem>
                <FormLabel>Dimensions</FormLabel>
                <p className="mb-2 text-muted-foreground text-sm">Dimensions cannot be changed after creation.</p>
                <Input disabled type="number" value={embeddingGen?.dimensions?.toString() || 'Not configured'} />
              </FormItem>

              <Controller
                control={control}
                name="embeddingGenerator.provider"
                render={({ field, fieldState }) => {
                  const currentProvider = field.value?.provider.case;
                  let currentApiKey = '';
                  if (currentProvider === 'openai') {
                    currentApiKey = field.value?.provider.value.apiKey || '';
                  } else if (currentProvider === 'cohere') {
                    currentApiKey = field.value?.provider.value.apiKey || '';
                  }

                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel required>API Key</FieldLabel>
                      <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                      <SecretSelector
                        availableSecrets={availableSecrets}
                        customText={{
                          dialogDescription: `Create a new secret for your ${currentProvider === 'openai' ? 'OpenAI' : 'Cohere'} API key`,
                          secretNamePlaceholder: `e.g., ${currentProvider === 'openai' ? 'OPENAI' : 'COHERE'}_API_KEY`,
                          secretValuePlaceholder: 'Enter API key',
                          secretValueDescription: `Your ${currentProvider === 'openai' ? 'OpenAI' : 'Cohere'} API key`,
                          emptyStateDescription: `Create a secret to securely store your ${currentProvider === 'openai' ? 'OpenAI' : 'Cohere'} API key`,
                        }}
                        onChange={(secretId) => {
                          if (currentProvider === 'openai') {
                            field.onChange(
                              create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
                                provider: {
                                  case: 'openai',
                                  value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_OpenAISchema, {
                                    apiKey: formatSecretTemplate(secretId),
                                  }),
                                },
                              })
                            );
                          } else if (currentProvider === 'cohere') {
                            const baseUrl = field.value?.provider.value.baseUrl || '';
                            field.onChange(
                              create(KnowledgeBaseUpdate_EmbeddingGenerator_ProviderSchema, {
                                provider: {
                                  case: 'cohere',
                                  value: create(KnowledgeBaseUpdate_EmbeddingGenerator_Provider_CohereSchema, {
                                    baseUrl,
                                    apiKey: formatSecretTemplate(secretId),
                                  }),
                                },
                              })
                            );
                          }
                        }}
                        placeholder={`Select ${currentProvider === 'openai' ? 'OpenAI' : 'Cohere'} API key from secrets`}
                        scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                        value={extractSecretName(currentApiKey || '')}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  );
                }}
              />
            </>
          ) : (
            <>
              <Heading level={3}>
                {embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} Configuration
              </Heading>
              <FormItem>
                <FormLabel>Model</FormLabel>
                <div className="relative">
                  <Input className="pl-9" disabled value={embeddingGen?.model || 'Not configured'} />
                  <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                    {embeddingGen?.provider?.provider.case === 'openai' ? (
                      <OpenAILogo className="h-4 w-4 shrink-0" />
                    ) : (
                      <CohereLogo className="h-4 w-4 shrink-0" />
                    )}
                  </div>
                </div>
              </FormItem>

              {embeddingGen?.provider?.provider.case === 'openai' && (
                <p className="-mt-2 mb-2 text-muted-foreground text-sm">
                  <Link
                    className="inline-flex items-center gap-1"
                    href="https://platform.openai.com/docs/guides/embeddings#embedding-models"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    OpenAI embedding models <ExternalLink className="h-3 w-3" />
                  </Link>{' '}
                  for available models and dimensions.
                </p>
              )}

              {embeddingGen?.provider?.provider.case === 'cohere' && (
                <p className="-mt-2 mb-2 text-muted-foreground text-sm">
                  See{' '}
                  <Link href="https://docs.cohere.com/docs/cohere-embed" rel="noopener noreferrer" target="_blank">
                    Cohere embedding models
                  </Link>{' '}
                  for available models and dimensions.
                </p>
              )}

              <FormItem>
                <FormLabel>Dimensions</FormLabel>
                <Input disabled value={embeddingGen?.dimensions?.toString() || 'Not configured'} />
              </FormItem>
              <div className="space-y-2">
                <FormLabel>API Key</FormLabel>
                <FieldDescription>All credentials are securely stored in your Secrets Store</FieldDescription>
                <Input
                  disabled
                  value={extractSecretName(embeddingGen?.provider?.provider.value?.apiKey || '') || 'Not configured'}
                />
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
